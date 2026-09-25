-- Modulo Compras / Proveedores — Fase 1: ABM de proveedores, cuenta corriente y pagos.
-- Convencion de saldo: saldo_pendiente > 0 => le DEBEMOS al proveedor; <= 0 => saldo a favor nuestro.

-- 1) Proveedores: campos que faltaban
ALTER TABLE t_proveedores
  ADD COLUMN IF NOT EXISTS contacto varchar,
  ADD COLUMN IF NOT EXISTS condicion_pago text NOT NULL DEFAULT 'contado',
  ADD COLUMN IF NOT EXISTS limite_credito numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

ALTER TABLE t_proveedores
  ADD CONSTRAINT t_proveedores_condicion_pago_check CHECK (condicion_pago IN ('contado', 'cuenta_corriente')),
  ADD CONSTRAINT t_proveedores_limite_credito_check CHECK (limite_credito >= 0);

-- 2) Cuenta corriente del proveedor (libro de movimientos; el saldo se deriva en la vista)
--    cargo / nota_debito  => aumentan la deuda con el proveedor
--    pago  / nota_credito => la reducen
--    compra_id queda libre (sin FK) hasta la Fase 3, cuando exista t_compras.
CREATE TABLE t_movimientos_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES t_proveedores(id),
  fecha date NOT NULL DEFAULT hoy_ar(),
  tipo text NOT NULL CHECK (tipo IN ('cargo', 'pago', 'nota_credito', 'nota_debito')),
  monto numeric NOT NULL CHECK (monto > 0),
  concepto text,
  forma_pago text,
  referencia text,
  compra_id uuid,
  usuario_id uuid REFERENCES t_usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mov_proveedor_proveedor ON t_movimientos_proveedor (proveedor_id, fecha DESC, created_at DESC);

ALTER TABLE t_movimientos_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_movimientos_proveedor FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trazabilidad: el egreso de caja generado por un pago a proveedor apunta a su movimiento
ALTER TABLE t_movimientos_caja
  ADD COLUMN IF NOT EXISTS movimiento_proveedor_id uuid REFERENCES t_movimientos_proveedor(id);

-- 3) Saldo por proveedor (fuente de verdad del saldo — no recalcular en el frontend)
CREATE OR REPLACE VIEW v_saldo_proveedores AS
SELECT
  p.id,
  p.nombre,
  p.razon_social,
  p.cuit,
  p.contacto,
  p.direccion,
  p.localidad,
  p.telefonos,
  p.email,
  p.condicion_pago,
  p.limite_credito,
  p.observaciones,
  p.activo,
  p.created_at,
  COALESCE(sum(m.monto) FILTER (WHERE m.tipo = 'cargo'), 0) AS total_cargos,
  COALESCE(sum(m.monto) FILTER (WHERE m.tipo = 'nota_debito'), 0) AS total_notas_debito,
  COALESCE(sum(m.monto) FILTER (WHERE m.tipo = 'pago'), 0) AS total_pagos,
  COALESCE(sum(m.monto) FILTER (WHERE m.tipo = 'nota_credito'), 0) AS total_notas_credito,
  COALESCE(sum(m.monto) FILTER (WHERE m.tipo IN ('cargo', 'nota_debito')), 0)
    - COALESCE(sum(m.monto) FILTER (WHERE m.tipo IN ('pago', 'nota_credito')), 0) AS saldo_pendiente
FROM t_proveedores p
LEFT JOIN t_movimientos_proveedor m ON m.proveedor_id = p.id
GROUP BY p.id;

-- 4) Movimientos con saldo acumulado por proveedor (para la cuenta corriente)
CREATE OR REPLACE VIEW v_cuenta_corriente_proveedor AS
SELECT
  m.id,
  m.proveedor_id,
  m.fecha,
  m.created_at,
  m.tipo,
  m.monto,
  m.concepto,
  m.forma_pago,
  m.referencia,
  m.compra_id,
  sum(CASE WHEN m.tipo IN ('cargo', 'nota_debito') THEN m.monto ELSE -m.monto END)
    OVER (PARTITION BY m.proveedor_id ORDER BY m.fecha, m.created_at, m.id) AS saldo_acumulado
FROM t_movimientos_proveedor m;

-- 5) Pago a proveedor (atomico): movimiento de CC + egreso de caja opcional
CREATE OR REPLACE FUNCTION registrar_pago_proveedor(
  p_proveedor_id uuid,
  p_monto numeric,
  p_forma_pago text,
  p_fecha date DEFAULT hoy_ar(),
  p_referencia text DEFAULT NULL,
  p_registrar_en_caja boolean DEFAULT true,
  p_tipo_gasto_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(movimiento_id uuid, movimiento_caja_id uuid, saldo_pendiente numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_nombre text;
  v_mov_id uuid;
  v_caja_id uuid;
  v_mov_caja_id uuid;
  v_saldo numeric;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor a cero';
  END IF;
  IF p_forma_pago IS NULL OR trim(p_forma_pago) = '' THEN
    RAISE EXCEPTION 'Indicá la forma de pago';
  END IF;

  SELECT nombre INTO v_nombre FROM t_proveedores WHERE id = p_proveedor_id;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'El proveedor no existe';
  END IF;

  IF p_registrar_en_caja THEN
    SELECT id INTO v_caja_id FROM v_caja_abierta;
    IF v_caja_id IS NULL THEN
      RAISE EXCEPTION 'No hay una caja abierta para registrar la salida del pago';
    END IF;
  END IF;

  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, forma_pago, referencia, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), 'pago', p_monto, 'Pago a proveedor',
          initcap(lower(trim(p_forma_pago))), NULLIF(trim(COALESCE(p_referencia, '')), ''), p_usuario_id)
  RETURNING id INTO v_mov_id;

  IF p_registrar_en_caja THEN
    INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion, tipo_gasto_id, movimiento_proveedor_id, usuario_id)
    VALUES (v_caja_id, 'egreso', 'gasto', initcap(lower(trim(p_forma_pago))), p_monto,
            'Pago a proveedor ' || v_nombre || COALESCE(' - ' || NULLIF(trim(COALESCE(p_referencia, '')), ''), ''),
            p_tipo_gasto_id, v_mov_id, p_usuario_id)
    RETURNING id INTO v_mov_caja_id;
  END IF;

  SELECT s.saldo_pendiente INTO v_saldo FROM v_saldo_proveedores s WHERE s.id = p_proveedor_id;

  RETURN QUERY SELECT v_mov_id, v_mov_caja_id, v_saldo;
END;
$function$;

-- 6) Ajuste manual de cuenta corriente (cargo inicial / nota de credito / nota de debito). No toca caja.
CREATE OR REPLACE FUNCTION registrar_ajuste_proveedor(
  p_proveedor_id uuid,
  p_tipo text,
  p_monto numeric,
  p_concepto text,
  p_fecha date DEFAULT hoy_ar(),
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(movimiento_id uuid, saldo_pendiente numeric)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mov_id uuid;
  v_saldo numeric;
BEGIN
  IF p_tipo NOT IN ('cargo', 'nota_credito', 'nota_debito') THEN
    RAISE EXCEPTION 'Tipo de ajuste inválido (usá cargo, nota_credito o nota_debito)';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a cero';
  END IF;
  IF p_concepto IS NULL OR trim(p_concepto) = '' THEN
    RAISE EXCEPTION 'El concepto es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_proveedores WHERE id = p_proveedor_id) THEN
    RAISE EXCEPTION 'El proveedor no existe';
  END IF;

  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), p_tipo, p_monto, trim(p_concepto), p_usuario_id)
  RETURNING id INTO v_mov_id;

  SELECT s.saldo_pendiente INTO v_saldo FROM v_saldo_proveedores s WHERE s.id = p_proveedor_id;

  RETURN QUERY SELECT v_mov_id, v_saldo;
END;
$function$;
