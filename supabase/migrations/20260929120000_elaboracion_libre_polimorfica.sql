-- Fase 12b — Elaboración libre (polimórfica insumo/producto), reemplaza el modelo de receta fija.
-- Pedido del usuario: el panel de elaboración debe dejar elegir CUALQUIER combinación de
-- insumos y/o productos como lo que se consume (con la cantidad exacta de cada uno, sin ninguna
-- fórmula/ratio automática), y un producto + cantidad como resultado. t_producto_insumos (la
-- "receta fija") NO se toca (pedido explícito del usuario: "lo de la receta dejalo por ahora") —
-- queda en la base sin uso desde esta RPC, no se borra.

DROP FUNCTION IF EXISTS elaborar_producto(uuid, numeric, text, uuid);

-- p_consumos: array de {tipo: 'insumo'|'producto', ref_id: uuid, cantidad: numeric}
CREATE FUNCTION elaborar_producto(
  p_producto_id uuid,
  p_cantidad numeric,
  p_consumos jsonb,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(elaboracion_id uuid, costo_total numeric, stock_nuevo numeric, insumos_en_negativo integer, productos_en_negativo integer)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prod record;
  v_c record;
  v_costo numeric := 0;
  v_costo_unit numeric;
  v_elab uuid;
  v_mov record;
  v_neg_ins int;
  v_neg_prod int;
  v_insumo_ids uuid[] := '{}';
  v_producto_ids uuid[] := '{}';
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad producida debe ser mayor a cero'; END IF;

  SELECT id, activo INTO v_prod FROM t_productos WHERE id = p_producto_id;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'El producto resultante no existe'; END IF;
  IF v_prod.activo = false THEN RAISE EXCEPTION 'El producto resultante está inactivo'; END IF;

  IF p_consumos IS NULL OR jsonb_typeof(p_consumos) <> 'array' OR jsonb_array_length(p_consumos) = 0 THEN
    RAISE EXCEPTION 'Elegí al menos un insumo o producto a consumir';
  END IF;

  FOR v_c IN SELECT * FROM jsonb_to_recordset(p_consumos) AS x(tipo text, ref_id uuid, cantidad numeric)
  LOOP
    IF v_c.tipo NOT IN ('insumo', 'producto') THEN RAISE EXCEPTION 'Tipo de consumo inválido'; END IF;
    IF v_c.ref_id IS NULL THEN RAISE EXCEPTION 'Falta elegir el insumo/producto en alguna línea'; END IF;
    IF v_c.cantidad IS NULL OR v_c.cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad consumida debe ser mayor a cero'; END IF;
    IF v_c.tipo = 'insumo' AND NOT EXISTS (SELECT 1 FROM t_insumos WHERE id = v_c.ref_id) THEN
      RAISE EXCEPTION 'Un insumo consumido no existe';
    END IF;
    IF v_c.tipo = 'producto' THEN
      IF v_c.ref_id = p_producto_id THEN
        RAISE EXCEPTION 'El producto resultante no puede consumirse a sí mismo en la misma elaboración';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM t_productos WHERE id = v_c.ref_id) THEN
        RAISE EXCEPTION 'Un producto consumido no existe';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO t_elaboraciones (producto_id, cantidad, motivo, usuario_id)
  VALUES (p_producto_id, p_cantidad, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_usuario_id)
  RETURNING id INTO v_elab;

  FOR v_c IN SELECT * FROM jsonb_to_recordset(p_consumos) AS x(tipo text, ref_id uuid, cantidad numeric)
  LOOP
    IF v_c.tipo = 'insumo' THEN
      PERFORM registrar_movimiento_stock(
        v_c.ref_id, 'salida', v_c.cantidad, NULL, false,
        'Elaboración #' || v_elab, 'elaboracion', v_elab, p_usuario_id
      );
      v_insumo_ids := array_append(v_insumo_ids, v_c.ref_id);

      SELECT COALESCE(ultimo_costo_compra, 0) / NULLIF(factor_compra, 0) INTO v_costo_unit
      FROM t_insumos WHERE id = v_c.ref_id;
      v_costo := v_costo + COALESCE(v_costo_unit, 0) * v_c.cantidad;
    ELSE
      PERFORM registrar_movimiento_stock_producto(
        v_c.ref_id, 'salida', v_c.cantidad, NULL,
        'Elaboración #' || v_elab, 'elaboracion', v_elab, p_usuario_id
      );
      v_producto_ids := array_append(v_producto_ids, v_c.ref_id);

      SELECT COALESCE(precio_costo, 0) INTO v_costo_unit FROM t_productos WHERE id = v_c.ref_id;
      v_costo := v_costo + COALESCE(v_costo_unit, 0) * v_c.cantidad;
    END IF;
  END LOOP;

  UPDATE t_elaboraciones SET costo_total = v_costo WHERE id = v_elab;

  SELECT * INTO v_mov FROM registrar_movimiento_stock_producto(
    p_producto_id, 'elaboracion', p_cantidad, NULL,
    'Elaboración #' || v_elab, 'elaboracion', v_elab, p_usuario_id
  );

  SELECT count(*) INTO v_neg_ins FROM t_insumos WHERE id = ANY(v_insumo_ids) AND stock < 0;
  SELECT count(*) INTO v_neg_prod FROM t_productos WHERE id = ANY(v_producto_ids) AND stock < 0;

  RETURN QUERY SELECT v_elab, v_costo, v_mov.stock_nuevo, v_neg_ins, v_neg_prod;
END;
$function$;

-- Historial unificado de elaboraciones: une consumo de insumos, consumo de productos (como
-- "insumo" de otra elaboración) y el resultado, agrupables por elaboracion_id (= referencia_id).
CREATE VIEW v_historial_elaboraciones WITH (security_invoker = true) AS
SELECT
  m.id, e.id AS elaboracion_id, 'insumo' AS tipo_registro,
  i.nombre AS item_nombre, m.cantidad, m.stock_anterior, m.stock_nuevo, m.created_at,
  e.motivo, e.fecha, ep.nombre AS producto_resultante_nombre, e.cantidad AS cantidad_producida
FROM t_movimientos_stock m
JOIN t_elaboraciones e ON e.id = m.referencia_id
JOIN t_insumos i ON i.id = m.insumo_id
JOIN t_productos ep ON ep.id = e.producto_id
WHERE m.referencia_tipo = 'elaboracion'

UNION ALL

SELECT
  m.id, e.id AS elaboracion_id,
  CASE WHEN m.tipo = 'elaboracion' THEN 'resultado' ELSE 'insumo' END AS tipo_registro,
  p.nombre AS item_nombre, m.cantidad, m.stock_anterior, m.stock_nuevo, m.created_at,
  e.motivo, e.fecha, ep.nombre AS producto_resultante_nombre, e.cantidad AS cantidad_producida
FROM t_movimientos_stock_producto m
JOIN t_elaboraciones e ON e.id = m.referencia_id
JOIN t_productos p ON p.id = m.producto_id
JOIN t_productos ep ON ep.id = e.producto_id
WHERE m.referencia_tipo = 'elaboracion';
