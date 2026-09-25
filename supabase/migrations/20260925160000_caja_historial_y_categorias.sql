-- Caja: categorias de movimiento, historial de cierres con desglose por medio de pago,
-- arqueo solo de efectivo, y cobros de trabajos impactando en caja.

-- 1) Categoria de movimiento (+ tipo de gasto del catalogo)
ALTER TABLE t_movimientos_caja
  ADD COLUMN IF NOT EXISTS categoria text,
  ADD COLUMN IF NOT EXISTS tipo_gasto_id uuid REFERENCES t_conf_tipos_gasto(id);

UPDATE t_movimientos_caja
SET categoria = CASE WHEN tipo = 'ingreso' THEN 'cobro' ELSE 'gasto' END
WHERE categoria IS NULL;

ALTER TABLE t_movimientos_caja
  ALTER COLUMN categoria SET NOT NULL,
  ADD CONSTRAINT t_movimientos_caja_categoria_check CHECK (
    (tipo = 'ingreso' AND categoria IN ('cobro', 'ingreso_extra'))
    OR (tipo = 'egreso' AND categoria IN ('gasto', 'retiro'))
  );

-- 2) Foto del turno al cerrar (historial de cierres)
ALTER TABLE t_aperturas_caja
  ADD COLUMN IF NOT EXISTS cerrada_at timestamptz,
  ADD COLUMN IF NOT EXISTS efectivo_esperado numeric,
  ADD COLUMN IF NOT EXISTS diferencia numeric,
  ADD COLUMN IF NOT EXISTS total_ingresos numeric,
  ADD COLUMN IF NOT EXISTS total_egresos numeric,
  ADD COLUMN IF NOT EXISTS total_retiros numeric,
  ADD COLUMN IF NOT EXISTS desglose_metodos jsonb;

COMMENT ON COLUMN t_aperturas_caja.saldo_cierre IS 'Efectivo contado fisicamente en el arqueo (antes del retiro).';
COMMENT ON COLUMN t_aperturas_caja.efectivo_esperado IS 'Efectivo que el sistema esperaba (saldo_inicio + ingresos en efectivo - egresos en efectivo, antes del retiro).';
COMMENT ON COLUMN t_aperturas_caja.desglose_metodos IS 'Array [{metodo, ingresos, egresos, neto}] del turno, incluye el retiro como egreso.';

-- 3) Vistas del turno abierto (v_saldo_caja_actual no se toca)
CREATE OR REPLACE VIEW v_caja_desglose_metodos AS
SELECT
  vca.id AS apertura_caja_id,
  initcap(lower(trim(COALESCE(NULLIF(mc.metodo, ''), 'Otro')))) AS metodo,
  COALESCE(sum(mc.monto) FILTER (WHERE mc.tipo = 'ingreso'), 0) AS ingresos,
  COALESCE(sum(mc.monto) FILTER (WHERE mc.tipo = 'egreso'), 0) AS egresos,
  COALESCE(sum(mc.monto) FILTER (WHERE mc.tipo = 'ingreso'), 0)
    - COALESCE(sum(mc.monto) FILTER (WHERE mc.tipo = 'egreso'), 0) AS neto
FROM v_caja_abierta vca
JOIN t_movimientos_caja mc ON mc.apertura_caja_id = vca.id
GROUP BY vca.id, initcap(lower(trim(COALESCE(NULLIF(mc.metodo, ''), 'Otro'))));

CREATE OR REPLACE VIEW v_caja_efectivo_actual AS
SELECT
  vca.id AS apertura_caja_id,
  vca.saldo_inicio,
  vca.saldo_inicio + COALESCE(sum(CASE WHEN mc.tipo = 'ingreso' THEN mc.monto ELSE -mc.monto END), 0) AS efectivo_esperado
FROM v_caja_abierta vca
LEFT JOIN t_movimientos_caja mc
  ON mc.apertura_caja_id = vca.id
 AND lower(trim(COALESCE(mc.metodo, ''))) = 'efectivo'
GROUP BY vca.id, vca.saldo_inicio;

-- 4) Cierre de turno: arqueo solo efectivo + foto del turno
CREATE OR REPLACE FUNCTION cerrar_y_reabrir_caja(
  p_apertura_id uuid,
  p_saldo_contado numeric,
  p_monto_retiro numeric DEFAULT 0,
  p_metodo_retiro text DEFAULT NULL,
  p_motivo_retiro text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(nueva_apertura_id uuid, saldo_inicio_nuevo numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_nueva_apertura_id uuid;
  v_saldo_inicio_nuevo numeric;
  v_esperado numeric;
  v_ingresos numeric;
  v_egresos numeric;
  v_desglose jsonb;
BEGIN
  IF p_saldo_contado IS NULL OR p_saldo_contado < 0 THEN
    RAISE EXCEPTION 'El efectivo contado debe ser mayor o igual a cero';
  END IF;
  IF p_monto_retiro IS NULL OR p_monto_retiro < 0 THEN
    RAISE EXCEPTION 'El monto del retiro no puede ser negativo';
  END IF;
  IF p_monto_retiro > p_saldo_contado THEN
    RAISE EXCEPTION 'No se puede retirar más de lo contado en el arqueo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_aperturas_caja WHERE id = p_apertura_id AND fecha_cierre IS NULL) THEN
    RAISE EXCEPTION 'La apertura de caja indicada no existe o ya está cerrada';
  END IF;

  -- Efectivo que el sistema esperaba, ANTES del retiro
  SELECT ac.saldo_inicio + COALESCE(sum(CASE WHEN mc.tipo = 'ingreso' THEN mc.monto ELSE -mc.monto END), 0)
  INTO v_esperado
  FROM t_aperturas_caja ac
  LEFT JOIN t_movimientos_caja mc
    ON mc.apertura_caja_id = ac.id AND lower(trim(COALESCE(mc.metodo, ''))) = 'efectivo'
  WHERE ac.id = p_apertura_id
  GROUP BY ac.saldo_inicio;

  -- 1. Retiro como egreso categoria 'retiro'
  IF p_monto_retiro > 0 THEN
    INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion, usuario_id)
    VALUES (p_apertura_id, 'egreso', 'retiro', COALESCE(p_metodo_retiro, 'Efectivo'), p_monto_retiro,
            COALESCE(p_motivo_retiro, 'Retiro al cerrar caja'), p_usuario_id);
  END IF;

  -- 2. Foto del turno (incluye el retiro en egresos por medio)
  SELECT
    COALESCE(sum(monto) FILTER (WHERE tipo = 'ingreso'), 0),
    COALESCE(sum(monto) FILTER (WHERE tipo = 'egreso' AND categoria <> 'retiro'), 0)
  INTO v_ingresos, v_egresos
  FROM t_movimientos_caja WHERE apertura_caja_id = p_apertura_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'metodo', metodo, 'ingresos', ingresos, 'egresos', egresos, 'neto', neto) ORDER BY metodo), '[]'::jsonb)
  INTO v_desglose
  FROM (
    SELECT
      initcap(lower(trim(COALESCE(NULLIF(metodo, ''), 'Otro')))) AS metodo,
      COALESCE(sum(monto) FILTER (WHERE tipo = 'ingreso'), 0) AS ingresos,
      COALESCE(sum(monto) FILTER (WHERE tipo = 'egreso'), 0) AS egresos,
      COALESCE(sum(monto) FILTER (WHERE tipo = 'ingreso'), 0) - COALESCE(sum(monto) FILTER (WHERE tipo = 'egreso'), 0) AS neto
    FROM t_movimientos_caja
    WHERE apertura_caja_id = p_apertura_id
    GROUP BY 1
  ) d;

  -- 3. Cerrar el turno
  UPDATE t_aperturas_caja
  SET fecha_cierre = CURRENT_DATE,
      cerrada_at = now(),
      saldo_cierre = p_saldo_contado,
      efectivo_esperado = COALESCE(v_esperado, 0),
      diferencia = p_saldo_contado - COALESCE(v_esperado, 0),
      total_ingresos = v_ingresos,
      total_egresos = v_egresos,
      total_retiros = p_monto_retiro,
      desglose_metodos = v_desglose
  WHERE id = p_apertura_id;

  -- 4. Reabrir con el efectivo que queda
  v_saldo_inicio_nuevo := p_saldo_contado - p_monto_retiro;

  INSERT INTO t_aperturas_caja (usuario_id, fecha_apertura, saldo_inicio, fecha_cierre, saldo_cierre)
  VALUES (p_usuario_id, CURRENT_DATE, v_saldo_inicio_nuevo, NULL, NULL)
  RETURNING id INTO v_nueva_apertura_id;

  RETURN QUERY SELECT v_nueva_apertura_id, v_saldo_inicio_nuevo;
END;
$function$;

-- 5) Cobros de trabajo (senia, cobro al entregar, pagos del JobModal) impactan en caja abierta
CREATE OR REPLACE FUNCTION registrar_pago_trabajo_en_caja()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_caja_id uuid;
  v_numero text;
BEGIN
  IF NEW.importe IS NULL OR NEW.importe <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_caja_id FROM v_caja_abierta;
  IF v_caja_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT numero_trabajo::text INTO v_numero FROM t_trabajos WHERE id = NEW.trabajo_id;

  INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion, pago_trabajo_id, usuario_id)
  VALUES (
    v_caja_id, 'ingreso', 'cobro',
    initcap(lower(trim(COALESCE(NULLIF(NEW.tipo_pago, ''), 'Otro')))),
    NEW.importe,
    'Cobro de trabajo' || COALESCE(' #' || v_numero, ''),
    NEW.id,
    NEW.usuario_id
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_pago_trabajo_a_caja
AFTER INSERT ON t_pagos_trabajo
FOR EACH ROW EXECUTE FUNCTION registrar_pago_trabajo_en_caja();
