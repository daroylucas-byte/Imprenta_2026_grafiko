-- Vista que deriva el estado real de cobro de cada comprobante, en vez de confiar
-- únicamente en t_comprobantes.estado (campo editable a mano que no se actualiza
-- cuando el trabajo vinculado se cobra por FIFO o pago directo).
--
-- Regla: si el comprobante está vinculado a un trabajo (t_comprobante_trabajos),
-- el estado de cobro se deriva del saldo_pendiente de ESE trabajo (v_saldo_trabajos),
-- ignorando t_comprobante_cobros (para no contar dos veces la seña, que ya se
-- registra en t_pagos_trabajo). Si no está vinculado a ningún trabajo, se deriva
-- de t_comprobante_cobros vs el total del comprobante. 'anulado' siempre se
-- respeta tal cual está guardado, porque es una decisión manual explícita.
CREATE VIEW v_estado_comprobantes AS
WITH trabajo_vinculado AS (
  SELECT ct.comprobante_id, ct.trabajo_id
  FROM t_comprobante_trabajos ct
), cobros_directos AS (
  SELECT cc.comprobante_id,
    COALESCE(SUM(cc.importe), 0) AS total_cobrado
  FROM t_comprobante_cobros cc
  GROUP BY cc.comprobante_id
)
SELECT
  c.id AS comprobante_id,
  c.estado AS estado_guardado,
  tv.trabajo_id,
  CASE
    WHEN c.estado = 'anulado' THEN 'anulado'
    WHEN tv.trabajo_id IS NOT NULL THEN
      CASE
        WHEN vst.saldo_pendiente <= 0 THEN 'cobrado'
        WHEN vst.saldo_pendiente < c.total THEN 'parcial'
        ELSE 'pendiente'
      END
    ELSE
      CASE
        WHEN COALESCE(cd.total_cobrado, 0) >= c.total AND c.total > 0 THEN 'cobrado'
        WHEN COALESCE(cd.total_cobrado, 0) > 0 THEN 'parcial'
        ELSE 'pendiente'
      END
  END AS estado_real,
  CASE
    WHEN tv.trabajo_id IS NOT NULL THEN COALESCE(vst.total_cobrado, 0)
    ELSE COALESCE(cd.total_cobrado, 0)
  END AS total_cobrado_real,
  CASE
    WHEN tv.trabajo_id IS NOT NULL THEN COALESCE(vst.saldo_pendiente, c.total)
    ELSE c.total - COALESCE(cd.total_cobrado, 0)
  END AS saldo_pendiente_real
FROM t_comprobantes c
LEFT JOIN trabajo_vinculado tv ON tv.comprobante_id = c.id
LEFT JOIN v_saldo_trabajos vst ON vst.id = tv.trabajo_id
LEFT JOIN cobros_directos cd ON cd.comprobante_id = c.id;

COMMENT ON VIEW v_estado_comprobantes IS 'Estado de cobro real de cada comprobante, derivado del trabajo vinculado (si existe) o de t_comprobante_cobros. No reemplaza t_comprobantes.estado (que sigue existiendo para casos manuales como anulado), sino que ofrece el estado calculado para que BillingPage no dependa solo del campo editado a mano.';
