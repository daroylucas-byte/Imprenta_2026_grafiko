-- Requerimiento 9: calculadora de costos internos (desglose por linea, invisible para el cliente).
-- Cada item del presupuesto puede tener un `costeo` jsonb: componentes (insumos / servicios propios / tercerizados / otros),
-- costo total y precio sugerido (costo * (1 + margen%)). El TOTAL del trabajo sigue saliendo solo de las lineas visibles.
-- El desglose se guarda DENTRO del item porque JobModal borra y reinserta los items en cada guardado.

-- 1) Unidad "Hora" para servicios (si no existe)
INSERT INTO t_conf_unidades_medida (nombre, created_at)
SELECT 'Hora', now() WHERE NOT EXISTS (SELECT 1 FROM t_conf_unidades_medida WHERE lower(nombre) = 'hora');

-- 2) Catalogo de servicios (propios y tercerizados)
CREATE TABLE t_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'propio' CHECK (tipo IN ('propio', 'tercerizado')),
  unidad_id uuid REFERENCES t_conf_unidades_medida(id),
  costo_unitario numeric NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE t_servicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_servicios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Configuracion de costeo (singleton): margen por defecto
CREATE TABLE t_config_costeo (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  margen_defecto_pct numeric NOT NULL DEFAULT 40 CHECK (margen_defecto_pct >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO t_config_costeo (id, margen_defecto_pct) VALUES (1, 40);
ALTER TABLE t_config_costeo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_config_costeo FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Desglose dentro del item
ALTER TABLE t_trabajo_productos ADD COLUMN costeo jsonb;
COMMENT ON COLUMN t_trabajo_productos.costeo IS 'Desglose INTERNO de costos de la linea (nunca se muestra al cliente). Lo normaliza el trigger trg_normalizar_costeo.';

-- 5) Normalizacion server-side: valida y recalcula subtotales, costo total y precio sugerido
--    (lo que mande el frontend en subtotal/costo_total/precio_sugerido se pisa)
CREATE OR REPLACE FUNCTION normalizar_costeo(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_comp jsonb;
  v_out jsonb := '[]'::jsonb;
  v_c jsonb;
  v_tipo text;
  v_nombre text;
  v_cant numeric;
  v_costo numeric;
  v_sub numeric;
  v_total numeric := 0;
  v_margen numeric;
  v_ref uuid;
  v_en_compra boolean;
  v_cant_stock numeric;
  v_factor numeric;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RAISE EXCEPTION 'El costeo debe ser un objeto'; END IF;

  v_comp := COALESCE(p->'componentes', '[]'::jsonb);
  IF jsonb_typeof(v_comp) <> 'array' THEN RAISE EXCEPTION 'Los componentes del costeo deben ser una lista'; END IF;

  v_margen := COALESCE((p->>'margen_pct')::numeric, (SELECT margen_defecto_pct FROM t_config_costeo WHERE id = 1), 0);
  IF v_margen < 0 THEN RAISE EXCEPTION 'El margen no puede ser negativo'; END IF;

  FOR v_c IN SELECT value FROM jsonb_array_elements(v_comp)
  LOOP
    v_tipo := v_c->>'tipo';
    IF v_tipo IS NULL OR v_tipo NOT IN ('insumo', 'servicio', 'tercerizado', 'otro') THEN
      RAISE EXCEPTION 'Tipo de componente inválido (usá insumo, servicio, tercerizado u otro)';
    END IF;
    v_nombre := NULLIF(trim(COALESCE(v_c->>'nombre', '')), '');
    IF v_nombre IS NULL THEN RAISE EXCEPTION 'Cada componente del costeo necesita un nombre'; END IF;

    v_cant := COALESCE((v_c->>'cantidad')::numeric, 0);
    v_costo := COALESCE((v_c->>'costo_unitario')::numeric, 0);
    IF v_cant < 0 OR v_costo < 0 THEN RAISE EXCEPTION 'Las cantidades y los costos no pueden ser negativos'; END IF;

    v_sub := round(v_cant * v_costo, 2);
    v_total := v_total + v_sub;

    v_ref := NULLIF(v_c->>'ref_id', '')::uuid;
    v_en_compra := COALESCE((v_c->>'en_unidad_compra')::boolean, false);
    v_cant_stock := NULL;
    IF v_tipo = 'insumo' AND v_ref IS NOT NULL THEN
      SELECT factor_compra INTO v_factor FROM t_insumos WHERE id = v_ref;
      IF v_factor IS NULL THEN RAISE EXCEPTION 'El insumo de un componente no existe'; END IF;
      v_cant_stock := v_cant * CASE WHEN v_en_compra THEN v_factor ELSE 1 END;  -- lo usara la Fase 4 (consumo de stock)
    END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'tipo', v_tipo,
      'ref_id', v_ref,
      'nombre', v_nombre,
      'unidad', NULLIF(trim(COALESCE(v_c->>'unidad', '')), ''),
      'cantidad', v_cant,
      'en_unidad_compra', v_en_compra,
      'cantidad_stock', v_cant_stock,
      'costo_unitario', v_costo,
      'subtotal', v_sub
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'margen_pct', v_margen,
    'componentes', v_out,
    'costo_total', v_total,
    'precio_sugerido', round(v_total * (1 + v_margen / 100), 2)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION trg_normalizar_costeo_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.costeo := normalizar_costeo(NEW.costeo);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_normalizar_costeo
BEFORE INSERT OR UPDATE OF costeo ON t_trabajo_productos
FOR EACH ROW WHEN (NEW.costeo IS NOT NULL)
EXECUTE FUNCTION trg_normalizar_costeo_fn();

-- 6) Margen por trabajo (solo uso interno). "margen_real_pct" es sobre el precio de venta.
CREATE OR REPLACE VIEW v_margen_trabajo WITH (security_invoker = true) AS
SELECT
  t.id AS trabajo_id,
  count(tp.id) AS items_total,
  count(tp.id) FILTER (WHERE tp.costeo IS NOT NULL) AS items_con_costeo,
  COALESCE(sum(tp.subtotal) FILTER (WHERE tp.costeo IS NOT NULL), 0) AS venta_con_costeo,
  COALESCE(sum((tp.costeo->>'costo_total')::numeric) FILTER (WHERE tp.costeo IS NOT NULL), 0) AS costo_interno,
  COALESCE(sum(tp.subtotal) FILTER (WHERE tp.costeo IS NOT NULL), 0)
    - COALESCE(sum((tp.costeo->>'costo_total')::numeric) FILTER (WHERE tp.costeo IS NOT NULL), 0) AS ganancia,
  CASE WHEN COALESCE(sum(tp.subtotal) FILTER (WHERE tp.costeo IS NOT NULL), 0) > 0
    THEN round(
      (COALESCE(sum(tp.subtotal) FILTER (WHERE tp.costeo IS NOT NULL), 0)
        - COALESCE(sum((tp.costeo->>'costo_total')::numeric) FILTER (WHERE tp.costeo IS NOT NULL), 0))
      / sum(tp.subtotal) FILTER (WHERE tp.costeo IS NOT NULL) * 100, 2)
    ELSE NULL END AS margen_real_pct
FROM t_trabajos t
LEFT JOIN t_trabajo_productos tp ON tp.trabajo_id = t.id
GROUP BY t.id;

-- 7) Duplicar trabajo: copia tambien el costeo de los items
CREATE OR REPLACE FUNCTION duplicar_trabajo(p_trabajo_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS TABLE(nuevo_trabajo_id uuid, items_precio_actualizado int)
LANGUAGE plpgsql
SET search_path = public, pg_temp
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
    'PRESUPUESTADO', hoy_ar(), 0, 0, false, p_usuario_id
  FROM t_trabajos
  WHERE id = p_trabajo_id
  RETURNING id INTO v_nuevo_id;

  INSERT INTO t_trabajo_productos (trabajo_id, producto_id, nombre, cantidad, tipo_precio, precio_unitario, costeo)
  SELECT
    v_nuevo_id, tp.producto_id, tp.nombre, tp.cantidad, tp.tipo_precio,
    CASE WHEN tp.producto_id IS NOT NULL AND COALESCE(p.precio_minorista, 0) > 0
         THEN p.precio_minorista ELSE tp.precio_unitario END,
    tp.costeo
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
