-- Bugs encontrados por la bateria de regresion (2026-09-25).
--
-- 1) registrar_cobro_con_fifo imputaba el cobro contra trabajos ANULADOS/CANCELADOS y contra
--    presupuestos SIN APROBAR (fecha_aprobacion NULL). Ejemplo real de la prueba: un cobro de $2.500 se aplico
--    entero a un trabajo ANULADO de $5.000, dejando sin pagar los trabajos vigentes. Solo se debe imputar contra
--    trabajos aprobados y no anulados (mismo criterio que la deuda en v_saldo_clientes y que aplicar_credito_a_trabajos).
--
-- 2) v_saldo_clientes.credito_disponible estaba inflado: recibos_cliente hacia
--    t_recibos LEFT JOIN t_recibo_trabajos y luego sum(r.total), asi que el total de un recibo se sumaba UNA VEZ POR CADA
--    trabajo al que se aplico (con FIFO casi todos los recibos se reparten en varios). Prueba: credito real $1.000,
--    mostrado $31.000. Ahora el total de recibos y lo aplicado se agregan por separado.

CREATE OR REPLACE FUNCTION public.registrar_cobro_con_fifo(p_cliente_id uuid, p_monto numeric, p_metodo text, p_fecha date DEFAULT hoy_ar(), p_observaciones text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(recibo_id uuid, monto_aplicado_fifo numeric, monto_no_aplicado numeric, movimiento_caja_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_recibo_id UUID;
  v_numero TEXT;
  v_monto_restante NUMERIC := p_monto;
  v_trabajo RECORD;
  v_a_aplicar NUMERIC;
  v_apertura_id UUID;
  v_movimiento_id UUID;
  v_total_aplicado NUMERIC := 0;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del cobro debe ser mayor a cero';
  END IF;

  -- 1. Crear el recibo
  v_numero := 'REC-' || to_char(now(), 'YYYYMMDDHH24MISS');

  INSERT INTO t_recibos (cliente_id, usuario_id, fecha, numero, total, observaciones)
  VALUES (p_cliente_id, p_usuario_id, p_fecha, v_numero, p_monto, p_observaciones)
  RETURNING id INTO v_recibo_id;

  INSERT INTO t_recibo_items (recibo_id, tipo, importe, observaciones)
  VALUES (v_recibo_id, COALESCE(p_metodo, 'Ninguno'), p_monto, 'Cobro registrado');

  -- 2. Imputar FIFO contra trabajos APROBADOS y no anulados con saldo pendiente (mas antiguos primero)
  FOR v_trabajo IN
    SELECT id, saldo_pendiente
    FROM v_saldo_trabajos
    WHERE cliente_id = p_cliente_id
      AND saldo_pendiente > 0
      AND fecha_aprobacion IS NOT NULL
      AND estado NOT IN ('ANULADO', 'CANCELADO')
    ORDER BY fecha_aprobacion ASC, id ASC
  LOOP
    EXIT WHEN v_monto_restante <= 0;

    v_a_aplicar := LEAST(v_trabajo.saldo_pendiente, v_monto_restante);

    INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado)
    VALUES (v_recibo_id, v_trabajo.id, v_a_aplicar);

    v_monto_restante := v_monto_restante - v_a_aplicar;
    v_total_aplicado := v_total_aplicado + v_a_aplicar;
  END LOOP;

  -- 3. Impacto en caja, solo si hay una apertura sin cerrar
  SELECT id INTO v_apertura_id FROM v_caja_abierta;

  IF v_apertura_id IS NOT NULL THEN
    INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion, recibo_id, usuario_id)
    VALUES (v_apertura_id, 'ingreso', 'cobro',
            initcap(lower(trim(COALESCE(NULLIF(p_metodo, ''), 'Otro')))),
            p_monto, 'Cobro a cliente', v_recibo_id, p_usuario_id)
    RETURNING id INTO v_movimiento_id;
  END IF;

  RETURN QUERY SELECT v_recibo_id, v_total_aplicado, v_monto_restante, v_movimiento_id;
END;
$function$;

-- Misma definicion de siempre, solo cambia recibos_cliente (total de recibos y aplicado, por separado)
CREATE OR REPLACE VIEW v_saldo_clientes WITH (security_invoker = true) AS
 WITH deuda_trabajos AS (
         SELECT t.cliente_id,
            COALESCE(sum(t.total), 0::numeric) AS total
           FROM t_trabajos t
          WHERE t.fecha_aprobacion IS NOT NULL AND (t.estado <> ALL (ARRAY['CANCELADO'::text, 'ANULADO'::text]))
          GROUP BY t.cliente_id
        ), deuda_comprobantes AS (
         SELECT v.cliente_id,
            COALESCE(sum(v.total), 0::numeric) AS total
           FROM t_comprobantes v
          WHERE v.estado <> 'anulado'::t_estado_comprobante AND NOT (EXISTS ( SELECT 1
                   FROM t_comprobante_trabajos ct
                  WHERE ct.comprobante_id = v.id))
          GROUP BY v.cliente_id
        ), pagos_directos AS (
         SELECT t_pagos_trabajo.cliente_id,
            COALESCE(sum(t_pagos_trabajo.importe), 0::numeric) AS total
           FROM t_pagos_trabajo
          GROUP BY t_pagos_trabajo.cliente_id
        ), recibos_total AS (
         SELECT r.cliente_id,
            COALESCE(sum(r.total), 0::numeric) AS total_recibos
           FROM t_recibos r
          GROUP BY r.cliente_id
        ), recibos_aplicado AS (
         SELECT r.cliente_id,
            COALESCE(sum(rt.monto_aplicado), 0::numeric) AS total_aplicado
           FROM t_recibo_trabajos rt
             JOIN t_recibos r ON r.id = rt.recibo_id
          GROUP BY r.cliente_id
        ), recibos_cliente AS (
         SELECT rtot.cliente_id,
            rtot.total_recibos,
            COALESCE(rap.total_aplicado, 0::numeric) AS total_aplicado
           FROM recibos_total rtot
             LEFT JOIN recibos_aplicado rap ON rap.cliente_id = rtot.cliente_id
        ), ajustes_cliente AS (
         SELECT a.cliente_id,
            COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'credito'::t_tipo_ajuste_cc), 0::numeric) AS total_credito,
            COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'debito'::t_tipo_ajuste_cc), 0::numeric) AS total_debito
           FROM t_ajustes_cc a
          GROUP BY a.cliente_id
        )
 SELECT c.id,
    c.nombre,
    c.razon_social,
    c.cuit,
    c.email,
    c.telefonos,
    c.created_at,
    COALESCE(dt.total, 0::numeric) + COALESCE(dc.total, 0::numeric) AS total_deuda,
    COALESCE(pd.total, 0::numeric) + COALESCE(rc.total_aplicado, 0::numeric) AS total_cobrado,
    COALESCE(ac.total_credito, 0::numeric) AS total_ajustes_credito,
    COALESCE(ac.total_debito, 0::numeric) AS total_ajustes_debito,
    COALESCE(dt.total, 0::numeric) + COALESCE(dc.total, 0::numeric) - COALESCE(pd.total, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric) - COALESCE(ac.total_credito, 0::numeric) + COALESCE(ac.total_debito, 0::numeric) AS saldo_pendiente,
    COALESCE(rc.total_recibos, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric) AS credito_disponible,
    c.activo
   FROM t_clientes c
     LEFT JOIN deuda_trabajos dt ON dt.cliente_id = c.id
     LEFT JOIN deuda_comprobantes dc ON dc.cliente_id = c.id
     LEFT JOIN pagos_directos pd ON pd.cliente_id = c.id
     LEFT JOIN recibos_cliente rc ON rc.cliente_id = c.id
     LEFT JOIN ajustes_cliente ac ON ac.cliente_id = c.id;

-- 3) aplicar_credito_a_trabajos (caso "todos los pendientes", p_trabajo_id NULL) tambien repartia credito a presupuestos
--    SIN APROBAR: la prueba dejo un cliente con saldo -$3.000 porque el credito se aplico a un presupuesto que no cuenta en
--    su deuda. Ahora, sin trabajo puntual, solo se reparte contra trabajos aprobados. Con un trabajo puntual (accion explicita
--    del usuario desde el modal del trabajo) se mantiene el comportamiento anterior. Sigue excluyendo ANULADO/CANCELADO.
CREATE OR REPLACE FUNCTION public.aplicar_credito_a_trabajos(p_cliente_id uuid, p_trabajo_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(aplicaciones_creadas integer, monto_total_aplicado numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_receipt RECORD;
  v_job RECORD;
  v_disponible numeric;
  v_to_apply numeric;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  FOR v_receipt IN
    SELECT r.id, r.total - COALESCE(SUM(rt.monto_aplicado), 0) AS disponible
    FROM t_recibos r
    LEFT JOIN t_recibo_trabajos rt ON rt.recibo_id = r.id
    WHERE r.cliente_id = p_cliente_id
    GROUP BY r.id, r.total, r.fecha
    HAVING r.total - COALESCE(SUM(rt.monto_aplicado), 0) > 0
    ORDER BY r.fecha ASC
  LOOP
    v_disponible := v_receipt.disponible;
    IF v_disponible <= 0 THEN CONTINUE; END IF;

    FOR v_job IN
      SELECT vt.id, vt.saldo_pendiente
      FROM v_saldo_trabajos vt
      WHERE vt.cliente_id = p_cliente_id
        AND vt.saldo_pendiente > 0
        AND vt.estado NOT IN ('ANULADO', 'CANCELADO')
        AND (p_trabajo_id IS NULL OR vt.id = p_trabajo_id)
        AND (p_trabajo_id IS NOT NULL OR vt.fecha_aprobacion IS NOT NULL)
      ORDER BY vt.fecha_aprobacion ASC NULLS LAST
    LOOP
      IF v_disponible <= 0 THEN EXIT; END IF;
      v_to_apply := LEAST(v_disponible, v_job.saldo_pendiente);
      IF v_to_apply <= 0 THEN CONTINUE; END IF;

      INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado)
      VALUES (v_receipt.id, v_job.id, v_to_apply);

      v_disponible := v_disponible - v_to_apply;
      v_count := v_count + 1;
      v_total := v_total + v_to_apply;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_count, v_total;
END;
$function$;
