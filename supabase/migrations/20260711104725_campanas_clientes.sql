-- Módulo "Campañas de Clientes": permite a Grafiko generar campañas de
-- marketing con IA EN NOMBRE de sus clientes (a diferencia de t_promociones,
-- que es para el propio marketing de Grafiko). La identidad visual queda
-- atada a cada cliente para reusarse entre campañas de ese mismo cliente.
-- Comparte el wallet de créditos existente (t_saldo_marketing) — decisión
-- consciente de simplicidad, no hay saldo separado por cliente.

-- Imágenes de referencia (logo, publicidades viejas) subidas por cliente
CREATE TABLE t_identidad_visual_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES t_clientes(id) ON DELETE CASCADE,
  imagen_url TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_identidad_visual_cliente_cliente_id ON t_identidad_visual_cliente(cliente_id);

-- Resultado del análisis de identidad visual, uno por cliente (no singleton
-- global como t_analisis_identidad). Se sobreescribe con el análisis más
-- reciente cada vez que se corre analizar-identidad-cliente para ese cliente.
CREATE TABLE t_analisis_identidad_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL UNIQUE REFERENCES t_clientes(id) ON DELETE CASCADE,
  estilo_descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Una campaña = un conjunto de piezas de marketing para un cliente en un
-- momento dado. Los campos objetivo/plataformas/publico_objetivo son los de
-- mayor impacto en el prompt; contexto_extra es texto libre sin estructurar
-- para todo lo demás (temporalidad, productos, competencia, etc.), mismo
-- patrón que t_config_promo.instruccion_extra en el módulo de Promociones.
CREATE TABLE t_campanas_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES t_clientes(id) ON DELETE CASCADE,
  nombre_campana TEXT NOT NULL,
  objetivo TEXT CHECK (objetivo IN ('awareness', 'leads', 'ventas', 'engagement', 'trafico')),
  plataformas TEXT[] DEFAULT '{}',
  publico_objetivo TEXT,
  contexto_extra TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa', 'archivada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campanas_cliente_cliente_id ON t_campanas_cliente(cliente_id);

-- Piezas generadas dentro de una campaña (mismo shape que t_promociones)
CREATE TABLE t_campana_piezas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id UUID NOT NULL REFERENCES t_campanas_cliente(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  hashtags TEXT[],
  llamada_accion TEXT,
  imagen_url TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campana_piezas_campana_id ON t_campana_piezas(campana_id);

ALTER TABLE t_identidad_visual_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_analisis_identidad_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_campanas_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_campana_piezas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_identidad_visual_cliente"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_analisis_identidad_cliente"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_campanas_cliente"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_campana_piezas"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Nuevos tipos de consumo del wallet compartido (t_transacciones_marketing.tipo)
ALTER TABLE t_transacciones_marketing DROP CONSTRAINT t_transacciones_marketing_tipo_check;
ALTER TABLE t_transacciones_marketing ADD CONSTRAINT t_transacciones_marketing_tipo_check
  CHECK (tipo IN ('carga', 'generar_promos', 'analizar_identidad', 'generar_imagen', 'analizar_identidad_cliente', 'generar_campana', 'generar_imagen_campana'));

COMMENT ON TABLE t_identidad_visual_cliente IS 'Imágenes de referencia de la marca de un CLIENTE de Grafiko (no de Grafiko mismo), para generar campañas de marketing en su nombre.';
COMMENT ON TABLE t_analisis_identidad_cliente IS 'Análisis de identidad visual por cliente (uno por cliente, no singleton). Se reusa entre todas las campañas de ese cliente.';
COMMENT ON TABLE t_campanas_cliente IS 'Campaña de marketing generada para un cliente de Grafiko. objetivo/plataformas/publico_objetivo son campos cortos estructurados; contexto_extra es texto libre para todo el resto.';
COMMENT ON TABLE t_campana_piezas IS 'Propuestas de texto/imagen generadas dentro de una campaña de cliente.';
