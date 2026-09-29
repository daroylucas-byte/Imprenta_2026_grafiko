-- Se agregan al final requiere_numeracion/requiere_fecha_muestra, que faltaban en v_productos_stock
-- (Fase 12) para que ProductsPage.tsx pueda traer todo en una sola consulta. No cambia el orden de
-- las columnas existentes, no hace falta DROP VIEW.
CREATE OR REPLACE VIEW v_productos_stock WITH (security_invoker = true) AS
SELECT
  p.id, p.nombre, p.descripcion, p.categoria, p.unidad_medida,
  p.precio_costo, p.precio_minorista, p.precio_mayorista,
  p.stock, p.stock_minimo, p.activo, p.created_at,
  (p.stock_minimo > 0 AND p.stock <= p.stock_minimo) AS bajo_minimo,
  (p.stock < 0) AS stock_negativo,
  EXISTS (SELECT 1 FROM t_producto_insumos ri WHERE ri.producto_id = p.id) AS tiene_receta,
  p.requiere_numeracion,
  p.requiere_fecha_muestra
FROM t_productos p;
