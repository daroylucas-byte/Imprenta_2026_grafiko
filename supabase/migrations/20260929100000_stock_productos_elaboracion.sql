-- Fase 12 — Stock real de productos + elaboración a partir de insumos + compras que mezclan
-- insumos y productos ya elaborados.
--
-- Contexto (pedido del usuario 2026-09-29): t_productos.stock existía como columna suelta, sin
-- historial ni protección (a diferencia de t_insumos, que ya tenía todo el mecanismo de la Fase 2).
-- Las compras solo aceptaban insumos. No existía ningún concepto de "elaborar" un producto a partir
-- de insumos (ej. carteles hechos con el insumo Papel).
--
-- Decisiones confirmadas por el usuario:
--   - El stock de un producto vendido en un trabajo se descuenta al pasar el trabajo a EN PRODUCCIÓN
--     (no al aprobar el presupuesto ni al entregar).
--   - Si ese trabajo se anula después de haber descontado stock, el stock vuelve solo.

-- ============================================================================
-- 1) t_productos: columnas nuevas (stock_minimo para alertas, igual que insumos)
-- ============================================================================
ALTER TABLE t_productos ADD COLUMN IF NOT EXISTS stock_minimo numeric NOT NULL DEFAULT 0;

-- ============================================================================
-- 2) t_trabajos: marca de si ya se descontó stock de producto para ese trabajo
-- ============================================================================
ALTER TABLE t_trabajos ADD COLUMN IF NOT EXISTS stock_descontado_en timestamptz;

-- ============================================================================
-- 3) t_compra_items: ahora un ítem puede ser un insumo O un producto (no ambos)
-- ============================================================================
ALTER TABLE t_compra_items ALTER COLUMN insumo_id DROP NOT NULL;
ALTER TABLE t_compra_items ADD COLUMN IF NOT EXISTS producto_id uuid REFERENCES t_productos(id);
ALTER TABLE t_compra_items
  ADD CONSTRAINT chk_compra_item_insumo_o_producto CHECK (
    (insumo_id IS NOT NULL AND producto_id IS NULL) OR (insumo_id IS NULL AND producto_id IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS idx_compra_items_producto ON t_compra_items(producto_id);

-- ============================================================================
-- 4) t_movimientos_stock_producto — espejo exacto de t_movimientos_stock (insumos),
--    con 2 tipos nuevos: 'elaboracion' (aumenta, se fabrica acá) y 'venta' (disminuye, trabajo)
-- ============================================================================
CREATE TABLE t_movimientos_stock_producto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES t_productos(id),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'elaboracion', 'venta', 'salida', 'ajuste', 'devolucion')),
  cantidad numeric NOT NULL DEFAULT 0,
  stock_anterior numeric,
  stock_nuevo numeric,
  motivo text,
  referencia_tipo text,
  referencia_id uuid,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_movimientos_stock_producto_producto ON t_movimientos_stock_producto(producto_id);

ALTER TABLE t_movimientos_stock_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_movimientos_stock_producto FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Igual que con insumos: el trigger calcula stock_anterior/stock_nuevo reales y pisa lo que
-- mande el cliente; 'ajuste' declara el stock objetivo (nunca negativo), el resto suma o resta.
CREATE OR REPLACE FUNCTION aplicar_movimiento_stock_producto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_anterior numeric;
  v_nuevo numeric;
BEGIN
  SELECT stock INTO v_anterior FROM t_productos WHERE id = NEW.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El producto no existe';
  END IF;

  IF NEW.tipo IN ('entrada', 'devolucion', 'elaboracion') THEN
    IF COALESCE(NEW.cantidad, 0) <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    v_nuevo := v_anterior + NEW.cantidad;
  ELSIF NEW.tipo IN ('salida', 'venta') THEN
    IF COALESCE(NEW.cantidad, 0) <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    v_nuevo := v_anterior - NEW.cantidad;
  ELSIF NEW.tipo = 'ajuste' THEN
    IF NEW.stock_nuevo IS NULL THEN RAISE EXCEPTION 'El ajuste requiere el stock objetivo'; END IF;
    IF NEW.stock_nuevo < 0 THEN RAISE EXCEPTION 'El stock objetivo no puede ser negativo'; END IF;
    v_nuevo := NEW.stock_nuevo;
    NEW.cantidad := abs(v_nuevo - v_anterior);
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento inválido';
  END IF;

  NEW.stock_anterior := v_anterior;
  NEW.stock_nuevo := v_nuevo;

  PERFORM set_config('grafiko.mov_stock_prod', '1', true);
  UPDATE t_productos SET stock = v_nuevo WHERE id = NEW.producto_id;
  PERFORM set_config('grafiko.mov_stock_prod', '0', true);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_aplicar_movimiento_stock_producto
BEFORE INSERT ON t_movimientos_stock_producto
FOR EACH ROW EXECUTE FUNCTION aplicar_movimiento_stock_producto();

-- Movimientos append-only, igual que insumos (reusa la función genérica ya existente)
CREATE TRIGGER trg_bloquear_edicion_movimiento_stock_producto
BEFORE UPDATE OR DELETE ON t_movimientos_stock_producto
FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_movimiento_stock();

-- t_productos.stock: fuerza 0 al crear y rechaza cualquier UPDATE directo (mismo mecanismo que insumos)
CREATE OR REPLACE FUNCTION proteger_stock_producto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stock := 0;
    RETURN NEW;
  END IF;
  IF NEW.stock IS DISTINCT FROM OLD.stock AND COALESCE(current_setting('grafiko.mov_stock_prod', true), '') <> '1' THEN
    RAISE EXCEPTION 'El stock no se puede modificar directamente: registrá un movimiento de stock';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_proteger_stock_producto
BEFORE INSERT OR UPDATE ON t_productos
FOR EACH ROW EXECUTE FUNCTION proteger_stock_producto();

CREATE OR REPLACE FUNCTION registrar_movimiento_stock_producto(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad numeric DEFAULT NULL,
  p_stock_objetivo numeric DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_referencia_tipo text DEFAULT 'manual',
  p_referencia_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(movimiento_id uuid, stock_anterior numeric, stock_nuevo numeric)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_ant numeric;
  v_nue numeric;
BEGIN
  IF p_tipo NOT IN ('entrada', 'elaboracion', 'venta', 'salida', 'ajuste', 'devolucion') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_productos WHERE id = p_producto_id) THEN
    RAISE EXCEPTION 'El producto no existe';
  END IF;

  IF p_tipo = 'ajuste' THEN
    IF p_stock_objetivo IS NULL THEN RAISE EXCEPTION 'Indicá el stock real contado'; END IF;
    IF p_motivo IS NULL OR trim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo del ajuste es obligatorio'; END IF;
    INSERT INTO t_movimientos_stock_producto (producto_id, tipo, stock_nuevo, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (p_producto_id, 'ajuste', p_stock_objetivo, trim(p_motivo), p_referencia_tipo, p_referencia_id, p_usuario_id)
    RETURNING id, t_movimientos_stock_producto.stock_anterior, t_movimientos_stock_producto.stock_nuevo INTO v_id, v_ant, v_nue;
  ELSE
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    INSERT INTO t_movimientos_stock_producto (producto_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (p_producto_id, p_tipo, p_cantidad, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_referencia_tipo, p_referencia_id, p_usuario_id)
    RETURNING id, t_movimientos_stock_producto.stock_anterior, t_movimientos_stock_producto.stock_nuevo INTO v_id, v_ant, v_nue;
  END IF;

  RETURN QUERY SELECT v_id, v_ant, v_nue;
END;
$function$;

-- ============================================================================
-- 5) t_producto_insumos — la "receta" (BOM): cuánto insumo (en su unidad de stock) lleva 1 unidad
--    del producto. Un producto puede no tener receta (se compra ya hecho) o tener varias líneas.
-- ============================================================================
CREATE TABLE t_producto_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES t_productos(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES t_insumos(id),
  cantidad_por_unidad numeric NOT NULL CHECK (cantidad_por_unidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (producto_id, insumo_id)
);
CREATE INDEX idx_producto_insumos_producto ON t_producto_insumos(producto_id);

ALTER TABLE t_producto_insumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_producto_insumos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 6) t_elaboraciones — cabecera de cada tanda producida (historial de "qué se fabricó cuándo")
-- ============================================================================
CREATE TABLE t_elaboraciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL REFERENCES t_productos(id),
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  costo_total numeric,
  motivo text,
  fecha date NOT NULL DEFAULT hoy_ar(),
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_elaboraciones_producto ON t_elaboraciones(producto_id);

ALTER TABLE t_elaboraciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_elaboraciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC atómica: descuenta cada insumo de la receta × cantidad y suma stock al producto, todo o nada.
-- El costo estimado sale de t_insumos.ultimo_costo_compra / factor_compra (costo por unidad de stock);
-- es informativo, no toca precio_costo del producto (ese campo lo sigue editando el usuario a mano).
CREATE OR REPLACE FUNCTION elaborar_producto(
  p_producto_id uuid,
  p_cantidad numeric,
  p_motivo text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(elaboracion_id uuid, costo_total numeric, stock_nuevo numeric, insumos_en_negativo integer)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prod record;
  v_receta record;
  v_costo numeric := 0;
  v_costo_unit numeric;
  v_elab uuid;
  v_mov record;
  v_neg int;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad a elaborar debe ser mayor a cero'; END IF;

  SELECT id, descripcion, activo INTO v_prod FROM t_productos WHERE id = p_producto_id;
  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'El producto no existe'; END IF;
  IF v_prod.activo = false THEN RAISE EXCEPTION 'El producto está inactivo'; END IF;

  IF NOT EXISTS (SELECT 1 FROM t_producto_insumos WHERE producto_id = p_producto_id) THEN
    RAISE EXCEPTION 'Este producto no tiene una receta cargada: definila antes de elaborar';
  END IF;

  INSERT INTO t_elaboraciones (producto_id, cantidad, motivo, usuario_id)
  VALUES (p_producto_id, p_cantidad, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_usuario_id)
  RETURNING id INTO v_elab;

  FOR v_receta IN SELECT insumo_id, cantidad_por_unidad FROM t_producto_insumos WHERE producto_id = p_producto_id
  LOOP
    PERFORM registrar_movimiento_stock(
      v_receta.insumo_id, 'salida', v_receta.cantidad_por_unidad * p_cantidad, NULL, false,
      'Elaboración de producto (x' || p_cantidad || ')', 'elaboracion', v_elab, p_usuario_id
    );

    SELECT COALESCE(ultimo_costo_compra, 0) / NULLIF(factor_compra, 0) INTO v_costo_unit
    FROM t_insumos WHERE id = v_receta.insumo_id;
    v_costo := v_costo + COALESCE(v_costo_unit, 0) * v_receta.cantidad_por_unidad * p_cantidad;
  END LOOP;

  UPDATE t_elaboraciones SET costo_total = v_costo WHERE id = v_elab;

  SELECT * INTO v_mov FROM registrar_movimiento_stock_producto(
    p_producto_id, 'elaboracion', p_cantidad, NULL,
    'Elaboración #' || v_elab, 'elaboracion', v_elab, p_usuario_id
  );

  SELECT count(*) INTO v_neg
  FROM t_insumos i
  WHERE i.stock < 0 AND i.id IN (SELECT insumo_id FROM t_producto_insumos WHERE producto_id = p_producto_id);

  RETURN QUERY SELECT v_elab, v_costo, v_mov.stock_nuevo, v_neg;
END;
$function$;

-- ============================================================================
-- 7) Venta: descuento de stock de producto al pasar un trabajo a EN PRODUCCIÓN
-- ============================================================================
CREATE OR REPLACE FUNCTION avanzar_a_produccion(
  p_trabajo_id uuid,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(items_descontados integer, ya_estaba_descontado boolean, productos_en_negativo integer)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_trabajo record;
  v_item record;
  v_count int := 0;
  v_ya boolean := false;
  v_neg int := 0;
BEGIN
  SELECT id, estado, stock_descontado_en, descripcion INTO v_trabajo FROM t_trabajos WHERE id = p_trabajo_id FOR UPDATE;
  IF v_trabajo.id IS NULL THEN RAISE EXCEPTION 'El trabajo no existe'; END IF;
  IF v_trabajo.estado IN ('ANULADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'No se puede pasar a producción un trabajo %', v_trabajo.estado;
  END IF;

  IF v_trabajo.stock_descontado_en IS NOT NULL THEN
    v_ya := true;
  ELSE
    FOR v_item IN
      SELECT producto_id, cantidad FROM t_trabajo_productos
      WHERE trabajo_id = p_trabajo_id AND producto_id IS NOT NULL
    LOOP
      PERFORM registrar_movimiento_stock_producto(
        v_item.producto_id, 'venta', v_item.cantidad, NULL,
        'Venta en trabajo ' || COALESCE(v_trabajo.descripcion, p_trabajo_id::text),
        'trabajo', p_trabajo_id, p_usuario_id
      );
      v_count := v_count + 1;
    END LOOP;

    IF v_count > 0 THEN
      SELECT count(*) INTO v_neg
      FROM t_productos p
      WHERE p.stock < 0 AND p.id IN (
        SELECT producto_id FROM t_trabajo_productos WHERE trabajo_id = p_trabajo_id AND producto_id IS NOT NULL
      );
    END IF;

    UPDATE t_trabajos SET stock_descontado_en = now() WHERE id = p_trabajo_id;
  END IF;

  UPDATE t_trabajos
  SET estado = 'EN PRODUCCIÓN',
      fecha_pase_produccion = now(),
      fecha_prod_fin = NULL,
      fecha_aprobacion = COALESCE(fecha_aprobacion, hoy_ar())
  WHERE id = p_trabajo_id;

  RETURN QUERY SELECT v_count, v_ya, v_neg;
END;
$function$;

-- Si un trabajo que ya descontó stock se anula, el stock vuelve solo (decisión confirmada del usuario).
CREATE OR REPLACE FUNCTION revertir_stock_trabajo_anulado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_item record;
BEGIN
  IF NEW.estado = 'ANULADO' AND OLD.estado IS DISTINCT FROM 'ANULADO' AND OLD.stock_descontado_en IS NOT NULL THEN
    FOR v_item IN
      SELECT producto_id, cantidad FROM t_trabajo_productos
      WHERE trabajo_id = NEW.id AND producto_id IS NOT NULL
    LOOP
      PERFORM registrar_movimiento_stock_producto(
        v_item.producto_id, 'devolucion', v_item.cantidad, NULL,
        'Anulación de trabajo ' || COALESCE(NEW.descripcion, NEW.id::text),
        'anulacion_trabajo', NEW.id, NULL
      );
    END LOOP;
    NEW.stock_descontado_en := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_revertir_stock_trabajo_anulado
BEFORE UPDATE ON t_trabajos
FOR EACH ROW EXECUTE FUNCTION revertir_stock_trabajo_anulado();

-- ============================================================================
-- 8) Compras: un ítem ahora puede ser insumo O producto (compra de mercadería ya elaborada)
-- ============================================================================
CREATE OR REPLACE FUNCTION registrar_compra(
  p_proveedor_id uuid,
  p_items jsonb,
  p_condicion_pago text,
  p_forma_pago text DEFAULT NULL::text,
  p_fecha date DEFAULT hoy_ar(),
  p_nro_comprobante text DEFAULT NULL::text,
  p_registrar_en_caja boolean DEFAULT true,
  p_tipo_gasto_id uuid DEFAULT NULL::uuid,
  p_observaciones text DEFAULT NULL::text,
  p_usuario_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(nueva_compra_id uuid, total_compra numeric, saldo_proveedor numeric)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prov record;
  v_total numeric;
  v_compra uuid;
  v_e record;
  v_ins record;
  v_insumo uuid;
  v_producto uuid;
  v_cant numeric;
  v_en boolean;
  v_costo numeric;
  v_cant_stock numeric;
  v_nro text := NULLIF(trim(COALESCE(p_nro_comprobante, '')), '');
  v_pago record;
  v_saldo numeric;
BEGIN
  SELECT id, nombre, activo INTO v_prov FROM t_proveedores WHERE id = p_proveedor_id;
  IF v_prov.id IS NULL THEN RAISE EXCEPTION 'El proveedor no existe'; END IF;
  IF v_prov.activo = false THEN RAISE EXCEPTION 'El proveedor está inactivo: reactivalo para registrar compras'; END IF;
  IF p_condicion_pago NOT IN ('contado', 'cuenta_corriente') THEN RAISE EXCEPTION 'Condición de pago inválida'; END IF;
  IF p_condicion_pago = 'contado' AND (p_forma_pago IS NULL OR trim(p_forma_pago) = '') THEN
    RAISE EXCEPTION 'Indicá la forma de pago de la compra al contado';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra necesita al menos un ítem';
  END IF;

  SELECT COALESCE(sum(round(x.cantidad * x.costo_unitario, 2)), 0) INTO v_total
  FROM jsonb_to_recordset(p_items) AS x(insumo_id uuid, producto_id uuid, cantidad numeric, en_unidad_compra boolean, costo_unitario numeric);

  FOR v_e IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(insumo_id uuid, producto_id uuid, cantidad numeric, en_unidad_compra boolean, costo_unitario numeric)
  LOOP
    IF (v_e.insumo_id IS NULL) = (v_e.producto_id IS NULL) THEN
      RAISE EXCEPTION 'Cada ítem de la compra debe ser un insumo o un producto (no ambos ni ninguno)';
    END IF;
    IF v_e.insumo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM t_insumos WHERE id = v_e.insumo_id) THEN
      RAISE EXCEPTION 'Un ítem de la compra tiene un insumo que no existe';
    END IF;
    IF v_e.producto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM t_productos WHERE id = v_e.producto_id) THEN
      RAISE EXCEPTION 'Un ítem de la compra tiene un producto que no existe';
    END IF;
    IF v_e.cantidad IS NULL OR v_e.cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad de cada ítem debe ser mayor a cero'; END IF;
    IF v_e.costo_unitario IS NULL OR v_e.costo_unitario < 0 THEN RAISE EXCEPTION 'El costo de cada ítem no puede ser negativo'; END IF;
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El total de la compra debe ser mayor a cero'; END IF;

  INSERT INTO t_compras (proveedor_id, fecha, nro_comprobante, condicion_pago, forma_pago, total, observaciones, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), v_nro, p_condicion_pago,
          CASE WHEN p_condicion_pago = 'contado' THEN initcap(lower(trim(p_forma_pago))) END,
          v_total, NULLIF(trim(COALESCE(p_observaciones, '')), ''), p_usuario_id)
  RETURNING id INTO v_compra;

  FOR v_e IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(insumo_id uuid, producto_id uuid, cantidad numeric, en_unidad_compra boolean, costo_unitario numeric)
  LOOP
    v_insumo := v_e.insumo_id;
    v_producto := v_e.producto_id;
    v_cant := v_e.cantidad;
    v_en := COALESCE(v_e.en_unidad_compra, false);
    v_costo := v_e.costo_unitario;

    IF v_insumo IS NOT NULL THEN
      SELECT factor_compra INTO v_ins FROM t_insumos WHERE id = v_insumo;
      v_cant_stock := v_cant * CASE WHEN v_en THEN v_ins.factor_compra ELSE 1 END;

      INSERT INTO t_compra_items (compra_id, insumo_id, cantidad, en_unidad_compra, costo_unitario, cantidad_stock)
      VALUES (v_compra, v_insumo, v_cant, v_en, v_costo, v_cant_stock);

      PERFORM registrar_movimiento_stock(v_insumo, 'entrada', v_cant, NULL, v_en,
                                         'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'), 'compra', v_compra, p_usuario_id);

      IF v_costo > 0 THEN
        UPDATE t_insumos
        SET ultimo_costo_compra = CASE WHEN v_en THEN v_costo ELSE v_costo * factor_compra END
        WHERE id = v_insumo;
      END IF;
    ELSE
      INSERT INTO t_compra_items (compra_id, producto_id, cantidad, en_unidad_compra, costo_unitario, cantidad_stock)
      VALUES (v_compra, v_producto, v_cant, false, v_costo, v_cant);

      PERFORM registrar_movimiento_stock_producto(v_producto, 'entrada', v_cant, NULL,
                                         'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'), 'compra', v_compra, p_usuario_id);
    END IF;
  END LOOP;

  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, compra_id, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), 'cargo', v_total,
          'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'), v_compra, p_usuario_id);

  IF p_condicion_pago = 'contado' THEN
    SELECT * INTO v_pago FROM registrar_pago_proveedor(
      p_proveedor_id, v_total, p_forma_pago, COALESCE(p_fecha, hoy_ar()),
      'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'),
      p_registrar_en_caja,
      COALESCE(p_tipo_gasto_id, (SELECT id FROM t_conf_tipos_gasto WHERE lower(nombre) = 'insumos' LIMIT 1)),
      p_usuario_id);
    UPDATE t_movimientos_proveedor
    SET compra_id = v_compra, concepto = 'Pago contado compra ' || COALESCE('N° ' || v_nro, 'sin comprobante')
    WHERE id = v_pago.movimiento_id;
  END IF;

  SELECT s.saldo_pendiente INTO v_saldo FROM v_saldo_proveedores s WHERE s.id = p_proveedor_id;
  RETURN QUERY SELECT v_compra, v_total, v_saldo;
END;
$function$;

-- anular_compra: cambia el tipo de retorno (se agrega productos_en_negativo), hace falta DROP.
DROP FUNCTION IF EXISTS anular_compra(uuid, text, uuid);

CREATE FUNCTION anular_compra(p_compra_id uuid, p_motivo text, p_usuario_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(compra_anulada_id uuid, saldo_proveedor numeric, insumos_en_negativo integer, productos_en_negativo integer)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_c record;
  v_it record;
  v_saldo numeric;
  v_neg int;
  v_neg_prod int;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de la anulación es obligatorio'; END IF;

  SELECT * INTO v_c FROM t_compras WHERE id = p_compra_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'La compra no existe'; END IF;
  IF v_c.estado = 'anulada' THEN RAISE EXCEPTION 'La compra ya está anulada'; END IF;

  FOR v_it IN SELECT insumo_id, producto_id, cantidad_stock FROM t_compra_items WHERE compra_id = p_compra_id
  LOOP
    IF v_it.insumo_id IS NOT NULL THEN
      PERFORM registrar_movimiento_stock(v_it.insumo_id, 'salida', v_it.cantidad_stock, NULL, false,
                                         'Anulación de compra ' || COALESCE('N° ' || v_c.nro_comprobante, 'sin comprobante'),
                                         'anulacion_compra', p_compra_id, p_usuario_id);
    ELSE
      PERFORM registrar_movimiento_stock_producto(v_it.producto_id, 'salida', v_it.cantidad_stock, NULL,
                                         'Anulación de compra ' || COALESCE('N° ' || v_c.nro_comprobante, 'sin comprobante'),
                                         'anulacion_compra', p_compra_id, p_usuario_id);
    END IF;
  END LOOP;

  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, compra_id, usuario_id)
  VALUES (v_c.proveedor_id, hoy_ar(), 'nota_credito', v_c.total,
          'Anulación compra ' || COALESCE('N° ' || v_c.nro_comprobante, 'sin comprobante'), p_compra_id, p_usuario_id);

  PERFORM set_config('grafiko.compra_op', '1', true);
  UPDATE t_compras SET estado = 'anulada', anulada_at = now(), motivo_anulacion = trim(p_motivo) WHERE id = p_compra_id;
  PERFORM set_config('grafiko.compra_op', '0', true);

  SELECT s.saldo_pendiente INTO v_saldo FROM v_saldo_proveedores s WHERE s.id = v_c.proveedor_id;
  SELECT count(*) INTO v_neg FROM t_insumos i
    WHERE i.stock < 0 AND i.id IN (SELECT insumo_id FROM t_compra_items WHERE compra_id = p_compra_id AND insumo_id IS NOT NULL);
  SELECT count(*) INTO v_neg_prod FROM t_productos pr
    WHERE pr.stock < 0 AND pr.id IN (SELECT producto_id FROM t_compra_items WHERE compra_id = p_compra_id AND producto_id IS NOT NULL);

  RETURN QUERY SELECT p_compra_id, v_saldo, v_neg, v_neg_prod;
END;
$function$;

-- ============================================================================
-- 9) Vistas (security_invoker, mismo patrón que el resto del proyecto)
-- ============================================================================
CREATE VIEW v_productos_stock WITH (security_invoker = true) AS
SELECT
  p.id, p.nombre, p.descripcion, p.categoria, p.unidad_medida,
  p.precio_costo, p.precio_minorista, p.precio_mayorista,
  p.stock, p.stock_minimo, p.activo, p.created_at,
  (p.stock_minimo > 0 AND p.stock <= p.stock_minimo) AS bajo_minimo,
  (p.stock < 0) AS stock_negativo,
  EXISTS (SELECT 1 FROM t_producto_insumos ri WHERE ri.producto_id = p.id) AS tiene_receta
FROM t_productos p;

CREATE VIEW v_movimientos_stock_producto WITH (security_invoker = true) AS
SELECT
  m.id, m.producto_id, p.nombre AS producto_nombre, p.unidad_medida,
  m.tipo, m.cantidad, m.stock_anterior, m.stock_nuevo, m.motivo,
  m.referencia_tipo, m.referencia_id, m.usuario_id, m.created_at
FROM t_movimientos_stock_producto m
JOIN t_productos p ON p.id = m.producto_id;

CREATE VIEW v_producto_receta WITH (security_invoker = true) AS
SELECT
  pi.id, pi.producto_id, pi.insumo_id, i.nombre AS insumo_nombre,
  us.nombre AS unidad_stock_nombre, pi.cantidad_por_unidad, pi.created_at
FROM t_producto_insumos pi
JOIN t_insumos i ON i.id = pi.insumo_id
JOIN t_conf_unidades_medida us ON us.id = i.unidad_stock_id;

CREATE VIEW v_elaboraciones WITH (security_invoker = true) AS
SELECT
  e.id, e.producto_id, p.nombre AS producto_nombre,
  e.cantidad, e.costo_total, e.motivo, e.fecha, e.usuario_id, e.created_at
FROM t_elaboraciones e
JOIN t_productos p ON p.id = e.producto_id;

-- v_compra_items: se amplía con las columnas de producto al final (no rompe el shape existente)
CREATE OR REPLACE VIEW v_compra_items WITH (security_invoker = true) AS
SELECT
  ci.id, ci.compra_id, ci.insumo_id, i.nombre AS insumo_nombre,
  us.nombre AS unidad_stock_nombre, uc.nombre AS unidad_compra_nombre, i.factor_compra,
  ci.cantidad, ci.en_unidad_compra, ci.costo_unitario, ci.cantidad_stock, ci.subtotal, ci.created_at,
  ci.producto_id, p.nombre AS producto_nombre, p.unidad_medida AS producto_unidad_medida,
  CASE WHEN ci.insumo_id IS NOT NULL THEN 'insumo' ELSE 'producto' END AS tipo_item
FROM t_compra_items ci
LEFT JOIN t_insumos i ON i.id = ci.insumo_id
LEFT JOIN t_conf_unidades_medida us ON us.id = i.unidad_stock_id
LEFT JOIN t_conf_unidades_medida uc ON uc.id = i.unidad_compra_id
LEFT JOIN t_productos p ON p.id = ci.producto_id;
