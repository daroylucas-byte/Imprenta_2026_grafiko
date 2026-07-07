-- Ajustes de cuenta corriente (notas de crédito / débito)
CREATE TYPE t_tipo_ajuste_cc AS ENUM ('credito', 'debito');

CREATE TABLE t_ajustes_cc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES t_clientes(id),
  tipo t_tipo_ajuste_cc NOT NULL,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  motivo TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id UUID REFERENCES t_usuarios(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE t_ajustes_cc IS 'Notas de crédito/débito manuales sobre la cuenta corriente de un cliente';

ALTER TABLE t_ajustes_cc ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_ajustes_cc"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Recrear v_saldo_clientes incluyendo los ajustes en el saldo
DROP VIEW v_saldo_clientes;

CREATE VIEW v_saldo_clientes AS
WITH deuda_trabajos AS (
  SELECT t.cliente_id,
    COALESCE(sum(t.total), 0::numeric) AS total
  FROM t_trabajos t
  WHERE t.fecha_aprobacion IS NOT NULL AND (t.estado <> ALL (ARRAY['cancelado'::text, 'anulado'::text]))
  GROUP BY t.cliente_id
), deuda_comprobantes AS (
  SELECT v.cliente_id,
    COALESCE(sum(v.total), 0::numeric) AS total
  FROM t_comprobantes v
  WHERE v.estado <> 'anulado'::t_estado_comprobante AND NOT (EXISTS (
    SELECT 1 FROM t_comprobante_trabajos ct WHERE ct.comprobante_id = v.id
  ))
  GROUP BY v.cliente_id
), pagos_directos AS (
  SELECT t_pagos_trabajo.cliente_id,
    COALESCE(sum(t_pagos_trabajo.importe), 0::numeric) AS total
  FROM t_pagos_trabajo
  GROUP BY t_pagos_trabajo.cliente_id
), recibos_cliente AS (
  SELECT r.cliente_id,
    COALESCE(sum(r.total), 0::numeric) AS total_recibos,
    COALESCE(sum(rt.monto_aplicado), 0::numeric) AS total_aplicado
  FROM t_recibos r
  LEFT JOIN t_recibo_trabajos rt ON rt.recibo_id = r.id
  GROUP BY r.cliente_id
), ajustes_cliente AS (
  SELECT a.cliente_id,
    COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'credito'), 0::numeric) AS total_credito,
    COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'debito'), 0::numeric) AS total_debito
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
  COALESCE(dt.total, 0::numeric) + COALESCE(dc.total, 0::numeric)
    - COALESCE(pd.total, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric)
    - COALESCE(ac.total_credito, 0::numeric) + COALESCE(ac.total_debito, 0::numeric) AS saldo_pendiente,
  COALESCE(rc.total_recibos, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric) AS credito_disponible
FROM t_clientes c
LEFT JOIN deuda_trabajos dt ON dt.cliente_id = c.id
LEFT JOIN deuda_comprobantes dc ON dc.cliente_id = c.id
LEFT JOIN pagos_directos pd ON pd.cliente_id = c.id
LEFT JOIN recibos_cliente rc ON rc.cliente_id = c.id
LEFT JOIN ajustes_cliente ac ON ac.cliente_id = c.id;
