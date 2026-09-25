-- Modulo Compras — Fase 2: insumos y stock.
-- El stock de un insumo SOLO se mueve por t_movimientos_stock (trigger). Nadie puede escribir t_insumos.stock a mano.
-- Cada insumo tiene una unidad de STOCK (en la que se lleva y se consume, ej. Hoja) y opcionalmente una unidad de
-- COMPRA (ej. Resma) con un factor: 1 unidad de compra = factor unidades de stock (1 Resma = 500 Hojas).

-- 1) Catalogos editables (mismo shape que las demas t_conf_*)
CREATE TABLE t_conf_unidades_medida (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre varchar NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE t_conf_categorias_insumo (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre varchar NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE t_conf_unidades_medida ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_conf_categorias_insumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_conf_unidades_medida FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON t_conf_categorias_insumo FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO t_conf_unidades_medida (nombre, created_at)
SELECT n, now() + (o * interval '1 second')
FROM unnest(ARRAY['Unidad','Resma','Hoja','Kilo','Litro','Metro','Caja','Rollo']) WITH ORDINALITY AS t(n, o);
INSERT INTO t_conf_categorias_insumo (nombre, created_at)
SELECT n, now() + (o * interval '1 second')
FROM unnest(ARRAY['Papel','Tintas','Planchas','Químicos','Embalaje','Otros']) WITH ORDINALITY AS t(n, o);

-- 2) Insumos
CREATE TABLE t_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  codigo text,
  categoria_id uuid REFERENCES t_conf_categorias_insumo(id),
  unidad_stock_id uuid NOT NULL REFERENCES t_conf_unidades_medida(id),
  unidad_compra_id uuid REFERENCES t_conf_unidades_medida(id),
  factor_compra numeric NOT NULL DEFAULT 1 CHECK (factor_compra > 0),
  stock numeric NOT NULL DEFAULT 0,               -- lo mantiene el trigger de movimientos, en unidad de STOCK
  stock_minimo numeric NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),  -- en unidad de STOCK
  ultimo_costo_compra numeric NOT NULL DEFAULT 0 CHECK (ultimo_costo_compra >= 0), -- por unidad de COMPRA
  observaciones text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT t_insumos_factor_sin_unidad_compra CHECK (unidad_compra_id IS NOT NULL OR factor_compra = 1)
);
CREATE INDEX idx_insumos_categoria ON t_insumos (categoria_id);
ALTER TABLE t_insumos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_insumos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Movimientos de stock (append-only)
CREATE TABLE t_movimientos_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES t_insumos(id),
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'devolucion')),
  cantidad numeric NOT NULL DEFAULT 0 CHECK (cantidad >= 0),   -- en unidad de STOCK
  stock_anterior numeric,
  stock_nuevo numeric,
  motivo text,
  referencia_tipo text,
  referencia_id uuid,
  usuario_id uuid REFERENCES t_usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mov_stock_insumo ON t_movimientos_stock (insumo_id, created_at DESC);
ALTER TABLE t_movimientos_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_movimientos_stock FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Proteccion del stock
CREATE OR REPLACE FUNCTION proteger_stock_insumo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stock := 0;  -- el stock inicial se carga con un movimiento de ajuste
    RETURN NEW;
  END IF;
  IF NEW.stock IS DISTINCT FROM OLD.stock AND COALESCE(current_setting('grafiko.mov_stock', true), '') <> '1' THEN
    RAISE EXCEPTION 'El stock no se puede modificar directamente: registrá un movimiento de stock';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_proteger_stock_insumo
BEFORE INSERT OR UPDATE ON t_insumos
FOR EACH ROW EXECUTE FUNCTION proteger_stock_insumo();

-- Calcula stock_anterior / stock_nuevo con el stock real (bloqueando la fila) y actualiza el insumo
CREATE OR REPLACE FUNCTION aplicar_movimiento_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_anterior numeric;
  v_nuevo numeric;
BEGIN
  SELECT stock INTO v_anterior FROM t_insumos WHERE id = NEW.insumo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El insumo no existe';
  END IF;

  IF NEW.tipo IN ('entrada', 'devolucion') THEN
    IF COALESCE(NEW.cantidad, 0) <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    v_nuevo := v_anterior + NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    IF COALESCE(NEW.cantidad, 0) <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    v_nuevo := v_anterior - NEW.cantidad;
  ELSE  -- ajuste: se declara el stock OBJETIVO en stock_nuevo, la cantidad se deduce
    IF NEW.stock_nuevo IS NULL THEN RAISE EXCEPTION 'El ajuste requiere el stock objetivo'; END IF;
    IF NEW.stock_nuevo < 0 THEN RAISE EXCEPTION 'El stock objetivo no puede ser negativo'; END IF;
    v_nuevo := NEW.stock_nuevo;
    NEW.cantidad := abs(v_nuevo - v_anterior);
  END IF;

  NEW.stock_anterior := v_anterior;
  NEW.stock_nuevo := v_nuevo;

  PERFORM set_config('grafiko.mov_stock', '1', true);
  UPDATE t_insumos SET stock = v_nuevo WHERE id = NEW.insumo_id;
  PERFORM set_config('grafiko.mov_stock', '0', true);

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_aplicar_movimiento_stock
BEFORE INSERT ON t_movimientos_stock
FOR EACH ROW EXECUTE FUNCTION aplicar_movimiento_stock();

-- Los movimientos no se editan ni se borran (auditoria). Un error se corrige con otro movimiento.
CREATE OR REPLACE FUNCTION bloquear_edicion_movimiento_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION 'Los movimientos de stock no se pueden modificar ni borrar: registrá un movimiento de ajuste';
END;
$function$;

CREATE TRIGGER trg_bloquear_edicion_movimiento_stock
BEFORE UPDATE OR DELETE ON t_movimientos_stock
FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_movimiento_stock();

-- 5) RPC: registrar movimiento (convierte unidades de compra a unidades de stock)
CREATE OR REPLACE FUNCTION registrar_movimiento_stock(
  p_insumo_id uuid,
  p_tipo text,
  p_cantidad numeric DEFAULT NULL,
  p_stock_objetivo numeric DEFAULT NULL,
  p_en_unidad_compra boolean DEFAULT false,
  p_motivo text DEFAULT NULL,
  p_referencia_tipo text DEFAULT 'manual',
  p_referencia_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(movimiento_id uuid, stock_anterior numeric, stock_nuevo numeric)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_factor numeric;
  v_mult numeric;
  v_id uuid;
  v_ant numeric;
  v_nue numeric;
BEGIN
  IF p_tipo NOT IN ('entrada', 'salida', 'ajuste', 'devolucion') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido';
  END IF;

  SELECT factor_compra INTO v_factor FROM t_insumos WHERE id = p_insumo_id;
  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'El insumo no existe';
  END IF;
  v_mult := CASE WHEN p_en_unidad_compra THEN v_factor ELSE 1 END;

  IF p_tipo = 'ajuste' THEN
    IF p_stock_objetivo IS NULL THEN RAISE EXCEPTION 'Indicá el stock real contado'; END IF;
    IF p_motivo IS NULL OR trim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo del ajuste es obligatorio'; END IF;
    INSERT INTO t_movimientos_stock (insumo_id, tipo, stock_nuevo, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (p_insumo_id, 'ajuste', p_stock_objetivo * v_mult, trim(p_motivo), p_referencia_tipo, p_referencia_id, p_usuario_id)
    RETURNING id, t_movimientos_stock.stock_anterior, t_movimientos_stock.stock_nuevo INTO v_id, v_ant, v_nue;
  ELSE
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero'; END IF;
    INSERT INTO t_movimientos_stock (insumo_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
    VALUES (p_insumo_id, p_tipo, p_cantidad * v_mult, NULLIF(trim(COALESCE(p_motivo, '')), ''), p_referencia_tipo, p_referencia_id, p_usuario_id)
    RETURNING id, t_movimientos_stock.stock_anterior, t_movimientos_stock.stock_nuevo INTO v_id, v_ant, v_nue;
  END IF;

  RETURN QUERY SELECT v_id, v_ant, v_nue;
END;
$function$;

-- 6) Vistas (security_invoker: respetan RLS de quien consulta)
CREATE OR REPLACE VIEW v_insumos_stock WITH (security_invoker = true) AS
SELECT
  i.id,
  i.nombre,
  i.codigo,
  i.categoria_id,
  c.nombre AS categoria_nombre,
  i.unidad_stock_id,
  us.nombre AS unidad_stock_nombre,
  i.unidad_compra_id,
  uc.nombre AS unidad_compra_nombre,
  i.factor_compra,
  i.stock,
  i.stock_minimo,
  i.ultimo_costo_compra,
  i.observaciones,
  i.activo,
  i.created_at,
  (i.stock_minimo > 0 AND i.stock <= i.stock_minimo) AS bajo_minimo,
  (i.stock < 0) AS stock_negativo,
  i.stock / i.factor_compra AS stock_en_unidad_compra,
  (i.stock / i.factor_compra) * i.ultimo_costo_compra AS valor_stock
FROM t_insumos i
JOIN t_conf_unidades_medida us ON us.id = i.unidad_stock_id
LEFT JOIN t_conf_unidades_medida uc ON uc.id = i.unidad_compra_id
LEFT JOIN t_conf_categorias_insumo c ON c.id = i.categoria_id;

CREATE OR REPLACE VIEW v_movimientos_stock WITH (security_invoker = true) AS
SELECT
  m.id,
  m.insumo_id,
  i.nombre AS insumo_nombre,
  us.nombre AS unidad_stock_nombre,
  m.tipo,
  m.cantidad,
  m.stock_anterior,
  m.stock_nuevo,
  m.motivo,
  m.referencia_tipo,
  m.referencia_id,
  m.usuario_id,
  m.created_at
FROM t_movimientos_stock m
JOIN t_insumos i ON i.id = m.insumo_id
JOIN t_conf_unidades_medida us ON us.id = i.unidad_stock_id;
