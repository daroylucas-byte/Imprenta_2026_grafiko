-- 1. subtotal de cada ítem pasa a ser columna generada (cantidad * precio_unitario)
ALTER TABLE t_trabajo_productos DROP COLUMN subtotal;
ALTER TABLE t_trabajo_productos ADD COLUMN subtotal numeric GENERATED ALWAYS AS (COALESCE(cantidad, 0) * COALESCE(precio_unitario, 0)) STORED;

-- 2. total del trabajo se recalcula solo cuando cambian sus ítems
CREATE OR REPLACE FUNCTION recalcular_total_trabajo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_trabajo_id uuid := COALESCE(NEW.trabajo_id, OLD.trabajo_id);
BEGIN
  UPDATE t_trabajos
  SET total = (SELECT COALESCE(SUM(subtotal), 0) FROM t_trabajo_productos WHERE trabajo_id = v_trabajo_id)
  WHERE id = v_trabajo_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_total_trabajo ON t_trabajo_productos;
CREATE TRIGGER trg_recalcular_total_trabajo
AFTER INSERT OR UPDATE OR DELETE ON t_trabajo_productos
FOR EACH ROW EXECUTE FUNCTION recalcular_total_trabajo();

COMMENT ON FUNCTION recalcular_total_trabajo IS 'Recalcula t_trabajos.total como SUM(t_trabajo_productos.subtotal) cada vez que cambian los ítems de un trabajo. El frontend ya no manda total en el insert/update de t_trabajos.';
