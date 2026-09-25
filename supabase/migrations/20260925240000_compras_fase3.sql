-- Modulo Compras — Fase 3: compras a proveedores.
-- Una compra es atomica: cabecera + items + entrada de stock + costo actualizado + cargo en la cuenta corriente del proveedor
-- + (si es al contado) el pago y la salida de caja. Si algo falla, no queda nada a medias.
-- Las compras no se editan ni se borran: se anulan (revierte stock y cuenta corriente).

-- 1) Tablas
CREATE TABLE t_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES t_proveedores(id),
  fecha date NOT NULL DEFAULT hoy_ar(),
  nro_comprobante text,
  estado text NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida', 'anulada')),
  condicion_pago text NOT NULL CHECK (condicion_pago IN ('contado', 'cuenta_corriente')),
  forma_pago text,
  total numeric NOT NULL CHECK (total > 0),
  observaciones text,
  anulada_at timestamptz,
  motivo_anulacion text,
  usuario_id uuid REFERENCES t_usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compras_proveedor ON t_compras (proveedor_id, fecha DESC);
ALTER TABLE t_compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_compras FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE t_compra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES t_compras(id),
  insumo_id uuid NOT NULL REFERENCES t_insumos(id),
  cantidad numeric NOT NULL CHECK (cantidad > 0),               -- en la unidad elegida (compra o stock)
  en_unidad_compra boolean NOT NULL DEFAULT false,
  costo_unitario numeric NOT NULL CHECK (costo_unitario >= 0),  -- por la unidad elegida
  cantidad_stock numeric NOT NULL CHECK (cantidad_stock > 0),   -- ya convertida a unidad de stock
  subtotal numeric GENERATED ALWAYS AS (round(cantidad * costo_unitario, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_compra_items_compra ON t_compra_items (compra_id);
CREATE INDEX idx_compra_items_insumo ON t_compra_items (insumo_id);
ALTER TABLE t_compra_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_compra_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- La cuenta corriente del proveedor ya tenia compra_id (sin FK): ahora apunta a la compra
ALTER TABLE t_movimientos_proveedor
  ADD CONSTRAINT t_movimientos_proveedor_compra_fk FOREIGN KEY (compra_id) REFERENCES t_compras(id);

-- 2) Proteccion: las compras no se editan ni se borran a mano
CREATE OR REPLACE FUNCTION bloquear_edicion_compra_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  RAISE EXCEPTION 'Los items de una compra no se pueden modificar ni borrar: anulá la compra y registrá una nueva';
END; $function$;
CREATE TRIGGER trg_bloquear_edicion_compra_item
BEFORE UPDATE OR DELETE ON t_compra_items FOR EACH ROW EXECUTE FUNCTION bloquear_edicion_compra_item();

CREATE OR REPLACE FUNCTION proteger_compra()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las compras no se pueden borrar: anulala';
  END IF;
  IF COALESCE(current_setting('grafiko.compra_op', true), '') <> '1' THEN
    RAISE EXCEPTION 'Las compras no se pueden modificar directamente: usá la anulación';
  END IF;
  RETURN NEW;
END; $function$;
CREATE TRIGGER trg_proteger_compra
BEFORE UPDATE OR DELETE ON t_compras FOR EACH ROW EXECUTE FUNCTION proteger_compra();

-- 3) Registrar compra (atomico)
--    p_items: [{ "insumo_id": uuid, "cantidad": n, "en_unidad_compra": bool, "costo_unitario": n }, ...]
CREATE OR REPLACE FUNCTION registrar_compra(
  p_proveedor_id uuid,
  p_items jsonb,
  p_condicion_pago text,
  p_forma_pago text DEFAULT NULL,
  p_fecha date DEFAULT hoy_ar(),
  p_nro_comprobante text DEFAULT NULL,
  p_registrar_en_caja boolean DEFAULT true,
  p_tipo_gasto_id uuid DEFAULT NULL,
  p_observaciones text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(nueva_compra_id uuid, total_compra numeric, saldo_proveedor numeric)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_prov record;
  v_total numeric;
  v_compra uuid;
  v_it record;
  v_e record;
  v_ins record;
  v_insumo uuid;
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

  -- Validar items y calcular el total
  SELECT COALESCE(sum(round(x.cantidad * x.costo_unitario, 2)), 0) INTO v_total
  FROM jsonb_to_recordset(p_items) AS x(insumo_id uuid, cantidad numeric, en_unidad_compra boolean, costo_unitario numeric);

  FOR v_it IN SELECT * FROM jsonb_to_recordset(p_items) AS x(insumo_id uuid, cantidad numeric, en_unidad_compra boolean, costo_unitario numeric)
  LOOP
    IF v_it.insumo_id IS NULL OR NOT EXISTS (SELECT 1 FROM t_insumos WHERE id = v_it.insumo_id) THEN
      RAISE EXCEPTION 'Un ítem de la compra tiene un insumo que no existe';
    END IF;
    IF v_it.cantidad IS NULL OR v_it.cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad de cada ítem debe ser mayor a cero'; END IF;
    IF v_it.costo_unitario IS NULL OR v_it.costo_unitario < 0 THEN RAISE EXCEPTION 'El costo de cada ítem no puede ser negativo'; END IF;
  END LOOP;
  IF v_total <= 0 THEN RAISE EXCEPTION 'El total de la compra debe ser mayor a cero'; END IF;

  INSERT INTO t_compras (proveedor_id, fecha, nro_comprobante, condicion_pago, forma_pago, total, observaciones, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), v_nro, p_condicion_pago,
          CASE WHEN p_condicion_pago = 'contado' THEN initcap(lower(trim(p_forma_pago))) END,
          v_total, NULLIF(trim(COALESCE(p_observaciones, '')), ''), p_usuario_id)
  RETURNING id INTO v_compra;

  -- Items: entrada de stock + ultimo costo (en el orden en que vinieron)
  FOR v_e IN
    SELECT e.value AS j, e.ordinality AS ord FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality) ORDER BY e.ordinality
  LOOP
    v_insumo := (v_e.j->>'insumo_id')::uuid;
    v_cant := (v_e.j->>'cantidad')::numeric;
    v_en := COALESCE((v_e.j->>'en_unidad_compra')::boolean, false);
    v_costo := (v_e.j->>'costo_unitario')::numeric;

    SELECT factor_compra INTO v_ins FROM t_insumos WHERE id = v_insumo;
    v_cant_stock := v_cant * CASE WHEN v_en THEN v_ins.factor_compra ELSE 1 END;

    INSERT INTO t_compra_items (compra_id, insumo_id, cantidad, en_unidad_compra, costo_unitario, cantidad_stock)
    VALUES (v_compra, v_insumo, v_cant, v_en, v_costo, v_cant_stock);

    PERFORM registrar_movimiento_stock(v_insumo, 'entrada', v_cant, NULL, v_en,
                                       'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'), 'compra', v_compra, p_usuario_id);

    -- ultimo costo POR UNIDAD DE COMPRA (si se compro en unidad de stock, se convierte con el factor)
    IF v_costo > 0 THEN
      UPDATE t_insumos
      SET ultimo_costo_compra = CASE WHEN v_en THEN v_costo ELSE v_costo * factor_compra END
      WHERE id = v_insumo;
    END IF;
  END LOOP;

  -- Cuenta corriente del proveedor: cargo por el total
  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, compra_id, usuario_id)
  VALUES (p_proveedor_id, COALESCE(p_fecha, hoy_ar()), 'cargo', v_total,
          'Compra ' || COALESCE('N° ' || v_nro, 'sin comprobante'), v_compra, p_usuario_id);

  -- Contado: pago inmediato (y salida de caja si corresponde). Si no hay caja abierta, se revierte todo.
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

-- 4) Anular compra (atomico): revierte el stock y el cargo. Un pago al contado NO se revierte:
--    queda como saldo a favor con el proveedor (hay que reclamarle el reintegro).
CREATE OR REPLACE FUNCTION anular_compra(p_compra_id uuid, p_motivo text, p_usuario_id uuid DEFAULT NULL)
RETURNS TABLE(compra_anulada_id uuid, saldo_proveedor numeric, insumos_en_negativo int)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_c record;
  v_it record;
  v_saldo numeric;
  v_neg int;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN RAISE EXCEPTION 'El motivo de la anulación es obligatorio'; END IF;

  SELECT * INTO v_c FROM t_compras WHERE id = p_compra_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'La compra no existe'; END IF;
  IF v_c.estado = 'anulada' THEN RAISE EXCEPTION 'La compra ya está anulada'; END IF;

  FOR v_it IN SELECT insumo_id, cantidad_stock FROM t_compra_items WHERE compra_id = p_compra_id
  LOOP
    PERFORM registrar_movimiento_stock(v_it.insumo_id, 'salida', v_it.cantidad_stock, NULL, false,
                                       'Anulación de compra ' || COALESCE('N° ' || v_c.nro_comprobante, 'sin comprobante'),
                                       'anulacion_compra', p_compra_id, p_usuario_id);
  END LOOP;

  INSERT INTO t_movimientos_proveedor (proveedor_id, fecha, tipo, monto, concepto, compra_id, usuario_id)
  VALUES (v_c.proveedor_id, hoy_ar(), 'nota_credito', v_c.total,
          'Anulación compra ' || COALESCE('N° ' || v_c.nro_comprobante, 'sin comprobante'), p_compra_id, p_usuario_id);

  PERFORM set_config('grafiko.compra_op', '1', true);
  UPDATE t_compras SET estado = 'anulada', anulada_at = now(), motivo_anulacion = trim(p_motivo) WHERE id = p_compra_id;
  PERFORM set_config('grafiko.compra_op', '0', true);

  SELECT s.saldo_pendiente INTO v_saldo FROM v_saldo_proveedores s WHERE s.id = v_c.proveedor_id;
  SELECT count(*) INTO v_neg FROM t_insumos i WHERE i.stock < 0 AND i.id IN (SELECT insumo_id FROM t_compra_items WHERE compra_id = p_compra_id);

  RETURN QUERY SELECT p_compra_id, v_saldo, v_neg;
END;
$function$;

-- 5) Vistas (security_invoker)
CREATE OR REPLACE VIEW v_compras WITH (security_invoker = true) AS
SELECT
  c.id, c.proveedor_id, p.nombre AS proveedor_nombre, c.fecha, c.nro_comprobante, c.estado,
  c.condicion_pago, c.forma_pago, c.total, c.observaciones, c.anulada_at, c.motivo_anulacion,
  c.usuario_id, c.created_at,
  (SELECT count(*) FROM t_compra_items ci WHERE ci.compra_id = c.id) AS cantidad_items
FROM t_compras c
JOIN t_proveedores p ON p.id = c.proveedor_id;

CREATE OR REPLACE VIEW v_compra_items WITH (security_invoker = true) AS
SELECT
  ci.id, ci.compra_id, ci.insumo_id, i.nombre AS insumo_nombre,
  us.nombre AS unidad_stock_nombre, uc.nombre AS unidad_compra_nombre, i.factor_compra,
  ci.cantidad, ci.en_unidad_compra, ci.costo_unitario, ci.cantidad_stock, ci.subtotal, ci.created_at
FROM t_compra_items ci
JOIN t_insumos i ON i.id = ci.insumo_id
JOIN t_conf_unidades_medida us ON us.id = i.unidad_stock_id
LEFT JOIN t_conf_unidades_medida uc ON uc.id = i.unidad_compra_id;
