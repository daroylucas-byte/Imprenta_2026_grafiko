-- Rendimiento (prueba de carga 2026-09-25, 20.000 trabajos / 60.000 items / 12.000 pagos):
-- el trigger recalcular_total_trabajo hace SUM() sobre t_trabajo_productos por trabajo_id SIN indice: cada edicion
-- de un item recorria toda la tabla. Con el indice: guardar un trabajo (borrar+reinsertar 5 items) 48 ms -> 0,9 ms,
-- duplicar_trabajo 27 ms -> 0,7 ms, editar un item 6,9 ms -> 0,4 ms, cobros de los ultimos 6 meses (Dashboard) 54 ms -> 4 ms.
-- Se indexan solo las FK que se usan en filtros/joins frecuentes (no las de usuario_id ni las de catalogos chicos).
CREATE INDEX IF NOT EXISTS idx_trabajo_productos_trabajo ON t_trabajo_productos (trabajo_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_cliente ON t_trabajos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_fecha_aprobacion ON t_trabajos (fecha_aprobacion);
CREATE INDEX IF NOT EXISTS idx_pagos_trabajo_trabajo ON t_pagos_trabajo (trabajo_id);
CREATE INDEX IF NOT EXISTS idx_pagos_trabajo_cliente ON t_pagos_trabajo (cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_trabajo_fecha ON t_pagos_trabajo (fecha);
CREATE INDEX IF NOT EXISTS idx_recibo_trabajos_trabajo ON t_recibo_trabajos (trabajo_id);
CREATE INDEX IF NOT EXISTS idx_recibo_trabajos_recibo ON t_recibo_trabajos (recibo_id);
CREATE INDEX IF NOT EXISTS idx_recibos_cliente ON t_recibos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_ajustes_cc_cliente ON t_ajustes_cc (cliente_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_apertura ON t_movimientos_caja (apertura_caja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comprobantes_cliente ON t_comprobantes (cliente_id);
CREATE INDEX IF NOT EXISTS idx_comprobante_trabajos_comprobante ON t_comprobante_trabajos (comprobante_id);
CREATE INDEX IF NOT EXISTS idx_comprobante_trabajos_trabajo ON t_comprobante_trabajos (trabajo_id);
CREATE INDEX IF NOT EXISTS idx_comprobante_cobros_comprobante ON t_comprobante_cobros (comprobante_id);
CREATE INDEX IF NOT EXISTS idx_comprobante_items_comprobante ON t_comprobante_items (comprobante_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_proveedor_compra ON t_movimientos_proveedor (compra_id) WHERE compra_id IS NOT NULL;

-- Politicas RLS duplicadas ("Allow all" y "Allow all access to authenticated" son identicas): con dos permisivas Postgres
-- evalua ambas en cada consulta. Se conserva "Allow all".
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_clientes;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_comprobante_cobros;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_comprobantes;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_productos;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_trabajo_productos;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_trabajos;
DROP POLICY IF EXISTS "Allow all access to authenticated" ON t_usuarios;
