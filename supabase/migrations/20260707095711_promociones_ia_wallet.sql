-- Wallet de créditos para el módulo de promociones IA (singleton, single-tenant:
-- no hay concepto de local_id en este proyecto).
CREATE TABLE t_saldo_marketing (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  saldo NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO t_saldo_marketing (id, saldo) VALUES (1, 0);

-- Historial de cargas y consumos del wallet
CREATE TABLE t_transacciones_marketing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('carga', 'generar_promos')),
  monto NUMERIC(12,2) NOT NULL, -- positivo en cargas, negativo en consumos
  descripcion TEXT,
  usuario_id UUID REFERENCES t_usuarios(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promociones generadas por IA
CREATE TABLE t_promociones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  hashtags TEXT[],
  llamada_accion TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Instrucciones personalizadas para el prompt de generación (singleton)
CREATE TABLE t_config_promo (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  instruccion_extra TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO t_config_promo (id, instruccion_extra) VALUES (1, NULL);

ALTER TABLE t_saldo_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_transacciones_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_config_promo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_saldo_marketing"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_transacciones_marketing"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_promociones"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_config_promo"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC atómica: carga de saldo manual (sin integración de pago, solo registro)
CREATE OR REPLACE FUNCTION cargar_saldo_marketing(
  p_monto NUMERIC,
  p_descripcion TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_nuevo_saldo NUMERIC;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto a cargar debe ser mayor a cero';
  END IF;

  UPDATE t_saldo_marketing SET saldo = saldo + p_monto, updated_at = NOW() WHERE id = 1
  RETURNING saldo INTO v_nuevo_saldo;

  INSERT INTO t_transacciones_marketing (tipo, monto, descripcion, usuario_id)
  VALUES ('carga', p_monto, p_descripcion, p_usuario_id);

  RETURN v_nuevo_saldo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC atómica: descuento de saldo por consumo (usada por la Edge Function con
-- service_role, y también invocable desde el cliente si hiciera falta validar antes)
CREATE OR REPLACE FUNCTION descontar_saldo_marketing(
  p_monto NUMERIC,
  p_tipo TEXT,
  p_descripcion TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS NUMERIC AS $$
DECLARE
  v_saldo_actual NUMERIC;
  v_nuevo_saldo NUMERIC;
BEGIN
  SELECT saldo INTO v_saldo_actual FROM t_saldo_marketing WHERE id = 1;

  IF v_saldo_actual < p_monto THEN
    RAISE EXCEPTION 'Saldo insuficiente: disponible %, requerido %', v_saldo_actual, p_monto;
  END IF;

  UPDATE t_saldo_marketing SET saldo = saldo - p_monto, updated_at = NOW() WHERE id = 1
  RETURNING saldo INTO v_nuevo_saldo;

  INSERT INTO t_transacciones_marketing (tipo, monto, descripcion, usuario_id)
  VALUES (p_tipo, -p_monto, p_descripcion, p_usuario_id);

  RETURN v_nuevo_saldo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cargar_saldo_marketing IS 'Carga manual de saldo al wallet de marketing (sin integración de pago real, solo registro contable).';
COMMENT ON FUNCTION descontar_saldo_marketing IS 'Descuenta saldo del wallet de marketing de forma atómica, usada al generar promociones. Lanza excepción si el saldo es insuficiente.';
