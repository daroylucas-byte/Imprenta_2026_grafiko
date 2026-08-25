ALTER TABLE t_trabajo_productos ADD COLUMN IF NOT EXISTS nombre text;
COMMENT ON COLUMN t_trabajo_productos.nombre IS 'Nombre del ítem cuando es manual (producto_id null) o override del nombre real del producto. Usado por el PDF de trabajo/presupuesto.';
