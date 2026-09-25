-- Fix: registrar_cobro_con_fifo no seteaba la columna nueva t_movimientos_caja.categoria (NOT NULL)
-- y el cobro a cuenta corriente fallaba. Ahora inserta categoria 'cobro' y normaliza el medio de pago.
CREATE OR REPLACE FUNCTION public.registrar_cobro_con_fifo(p_cliente_id uuid, p_monto numeric, p_metodo text, p_fecha date DEFAULT CURRENT_DATE, p_observaciones text DEFAULT NULL::text, p_usuario_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(recibo_id uuid, monto_aplicado_fifo numeric, monto_no_aplicado numeric, movimiento_caja_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
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

  -- 2. Imputar FIFO contra trabajos con saldo pendiente (más antiguos primero)
  FOR v_trabajo IN
    SELECT id, saldo_pendiente
    FROM v_saldo_trabajos
    WHERE cliente_id = p_cliente_id
      AND saldo_pendiente > 0
    ORDER BY fecha_aprobacion ASC NULLS LAST, id ASC
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
