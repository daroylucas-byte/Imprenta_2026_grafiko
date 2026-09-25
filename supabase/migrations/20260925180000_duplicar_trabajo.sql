-- Duplicar un trabajo: crea uno nuevo PRESUPUESTADO con las specs, condiciones e items del original.
-- No copia pagos, sena, fechas de aprobacion/produccion/entrega, facturacion ni numeracion.
-- Los items con producto de catalogo toman el precio_minorista vigente (si es > 0); si no, el del original.
-- Atomico: si algo falla no queda un trabajo a medias.
CREATE OR REPLACE FUNCTION duplicar_trabajo(p_trabajo_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS TABLE(nuevo_trabajo_id uuid, items_precio_actualizado int)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_nuevo_id uuid;
  v_actualizados int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM t_trabajos WHERE id = p_trabajo_id) THEN
    RAISE EXCEPTION 'El trabajo a duplicar no existe';
  END IF;

  INSERT INTO t_trabajos (
    cliente_id, nombre_trabajo, descripcion, observaciones, prioridad, tipo_comprobante,
    acabado_id, soporte_id, sistema_impresion_id, tamanio_papel_id, terminacion_id,
    tipo_entrega_id, peliculado_id, cant_copias_id, cantidad,
    cant_tinta, color_tinta, color_papel, tamanio_otro,
    numerado, troquelado, troquel_cliente, perforado, condiciones,
    estado, fecha, sena, descuento, facturado, usuario_id
  )
  SELECT
    cliente_id, CASE WHEN nombre_trabajo IS NULL OR nombre_trabajo = '' THEN NULL ELSE nombre_trabajo || ' (copia)' END,
    descripcion, observaciones, prioridad, tipo_comprobante,
    acabado_id, soporte_id, sistema_impresion_id, tamanio_papel_id, terminacion_id,
    tipo_entrega_id, peliculado_id, cant_copias_id, cantidad,
    cant_tinta, color_tinta, color_papel, tamanio_otro,
    numerado, troquelado, troquel_cliente, perforado, condiciones,
    'PRESUPUESTADO', CURRENT_DATE, 0, 0, false, p_usuario_id
  FROM t_trabajos
  WHERE id = p_trabajo_id
  RETURNING id INTO v_nuevo_id;

  -- Items: el total del trabajo lo recalcula el trigger recalcular_total_trabajo
  INSERT INTO t_trabajo_productos (trabajo_id, producto_id, nombre, cantidad, tipo_precio, precio_unitario)
  SELECT
    v_nuevo_id, tp.producto_id, tp.nombre, tp.cantidad, tp.tipo_precio,
    CASE WHEN tp.producto_id IS NOT NULL AND COALESCE(p.precio_minorista, 0) > 0
         THEN p.precio_minorista ELSE tp.precio_unitario END
  FROM t_trabajo_productos tp
  LEFT JOIN t_productos p ON p.id = tp.producto_id
  WHERE tp.trabajo_id = p_trabajo_id;

  SELECT count(*) INTO v_actualizados
  FROM t_trabajo_productos tp
  JOIN t_productos p ON p.id = tp.producto_id
  WHERE tp.trabajo_id = p_trabajo_id
    AND COALESCE(p.precio_minorista, 0) > 0
    AND p.precio_minorista <> tp.precio_unitario;

  RETURN QUERY SELECT v_nuevo_id, v_actualizados;
END;
$function$;
