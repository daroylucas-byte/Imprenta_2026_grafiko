-- Ranking de clientes por monto vendido (trabajos aprobados, sin anulados/cancelados)
-- en un rango de fechas de aprobacion. Incluye saldo pendiente para alerta de deuda.
CREATE OR REPLACE FUNCTION ranking_clientes(
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  cliente_id uuid,
  nombre text,
  total_vendido numeric,
  cantidad_trabajos bigint,
  saldo_pendiente numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    t.cliente_id,
    COALESCE(NULLIF(c.razon_social, ''), c.nombre)::text AS nombre,
    SUM(t.total) AS total_vendido,
    COUNT(*) AS cantidad_trabajos,
    COALESCE(s.saldo_pendiente, 0) AS saldo_pendiente
  FROM t_trabajos t
  JOIN t_clientes c ON c.id = t.cliente_id
  LEFT JOIN v_saldo_clientes s ON s.id = t.cliente_id
  WHERE t.fecha_aprobacion IS NOT NULL
    AND t.estado NOT IN ('ANULADO', 'CANCELADO')
    AND (p_desde IS NULL OR t.fecha_aprobacion::date >= p_desde)
    AND (p_hasta IS NULL OR t.fecha_aprobacion::date <= p_hasta)
  GROUP BY t.cliente_id, c.razon_social, c.nombre, s.saldo_pendiente
  ORDER BY total_vendido DESC
  LIMIT p_limit;
$$;
