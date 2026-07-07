-- Movimientos de caja, ligados a una apertura de caja (no llevan cliente_id directo:
-- se obtiene vía recibo_id -> t_recibos.cliente_id si hace falta)
CREATE TYPE t_tipo_movimiento_caja AS ENUM ('ingreso', 'egreso');

CREATE TABLE t_movimientos_caja (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apertura_caja_id UUID NOT NULL REFERENCES t_aperturas_caja(id),
  tipo t_tipo_movimiento_caja NOT NULL,
  metodo TEXT,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  descripcion TEXT,
  recibo_id UUID REFERENCES t_recibos(id),
  pago_trabajo_id UUID REFERENCES t_pagos_trabajo(id),
  usuario_id UUID REFERENCES t_usuarios(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE t_movimientos_caja IS 'Ingresos/egresos de una caja abierta (t_aperturas_caja). No tiene cliente_id directo: se obtiene vía recibo_id -> t_recibos.cliente_id.';

ALTER TABLE t_movimientos_caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_movimientos_caja"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vista de caja abierta actual (si existe), para que el frontend no tenga que
-- calcular "fecha_cierre IS NULL, la más reciente" a mano en cada lugar.
CREATE VIEW v_caja_abierta AS
SELECT ac.*
FROM t_aperturas_caja ac
WHERE ac.fecha_cierre IS NULL
ORDER BY ac.fecha_apertura DESC, ac.created_at DESC
LIMIT 1;

-- Vista de saldo de caja: ingresos - egresos de la apertura actualmente abierta
CREATE VIEW v_saldo_caja_actual AS
SELECT
  vca.id AS apertura_caja_id,
  vca.saldo_inicio,
  COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'ingreso'), 0) AS total_ingresos,
  COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'egreso'), 0) AS total_egresos,
  vca.saldo_inicio
    + COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'ingreso'), 0)
    - COALESCE(SUM(mc.monto) FILTER (WHERE mc.tipo = 'egreso'), 0) AS saldo_actual
FROM v_caja_abierta vca
LEFT JOIN t_movimientos_caja mc ON mc.apertura_caja_id = vca.id
GROUP BY vca.id, vca.saldo_inicio;

-- RPC atómica: registra un cobro (recibo), lo imputa FIFO contra los trabajos
-- pendientes del cliente (más antiguos primero, según v_saldo_trabajos), y si hay
-- una caja abierta, registra el ingreso correspondiente. Todo en una sola transacción:
-- si algo fallara a mitad de camino, Postgres revierte todo (no quedan estados a medias).
CREATE OR REPLACE FUNCTION registrar_cobro_con_fifo(
  p_cliente_id UUID,
  p_monto NUMERIC,
  p_metodo TEXT,
  p_fecha DATE DEFAULT CURRENT_DATE,
  p_observaciones TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  recibo_id UUID,
  monto_aplicado_fifo NUMERIC,
  monto_no_aplicado NUMERIC,
  movimiento_caja_id UUID
) AS $$
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
    INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, metodo, monto, descripcion, recibo_id, usuario_id)
    VALUES (v_apertura_id, 'ingreso', p_metodo, p_monto, 'Cobro a cliente', v_recibo_id, p_usuario_id)
    RETURNING id INTO v_movimiento_id;
  END IF;

  RETURN QUERY SELECT v_recibo_id, v_total_aplicado, v_monto_restante, v_movimiento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION registrar_cobro_con_fifo IS 'Registra un cobro (t_recibos + t_recibo_items), imputa FIFO contra trabajos pendientes del cliente (t_recibo_trabajos) y registra el ingreso en caja si hay una apertura activa (t_movimientos_caja).';
