-- Rediseño del módulo "Campañas de Clientes" (v1 nunca llegó a usarse, 0 filas
-- en ambas tablas — se reemplaza en limpio en vez de migrar datos).
--
-- Estructura de 3 niveles, calcada de un plan de campaña real de agencia:
--   Nivel 1: Campaña (resumen ejecutivo + los 4 pilares temáticos semanales,
--            generados juntos en una sola llamada a Gemini, respuesta chica).
--   Nivel 2: Posts individuales de UNA semana a la vez (generados bajo
--            demanda por semana, ~7 posts por llamada — evita pedirle a
--            Gemini el mes completo de una, que es una respuesta larga y
--            propensa a cortarse o venir con JSON mal formado).
--   Nivel 3: cada post puede generar su propia imagen (igual patrón ya
--            usado en el resto del sistema).
--
-- meta_cuantificable es un campo de TEXTO LIBRE que completa el USUARIO
-- (ej. "+500 seguidores", "10% engagement rate") — deliberadamente no se le
-- pide a la IA que invente métricas de resultado esperadas, porque no hay
-- ninguna integración real con Instagram/TikTok detrás para sustentarlas.

DROP TABLE IF EXISTS t_campana_piezas;
DROP TABLE IF EXISTS t_campanas_cliente;

-- t_identidad_visual_cliente y t_analisis_identidad_cliente ya existen (creadas
-- en la migración anterior, sin cambios de diseño en esta v2) — no se recrean.

-- Nivel 1: Campaña
CREATE TABLE t_campanas_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES t_clientes(id) ON DELETE CASCADE,
  nombre_campana TEXT NOT NULL,
  fecha_inicio DATE,
  fecha_fin DATE,
  objetivo TEXT CHECK (objetivo IN ('awareness', 'leads', 'ventas', 'engagement', 'trafico')),
  meta_cuantificable TEXT,
  plataformas TEXT[] DEFAULT '{}',
  publico_objetivo TEXT,
  contexto_extra TEXT,
  pilares_semanales JSONB,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa', 'archivada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campanas_cliente_cliente_id ON t_campanas_cliente(cliente_id);

-- Nivel 2: Posts individuales, generados semana a semana dentro de una campaña
CREATE TABLE t_campana_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id UUID NOT NULL REFERENCES t_campanas_cliente(id) ON DELETE CASCADE,
  semana INT NOT NULL CHECK (semana BETWEEN 1 AND 4),
  fecha DATE,
  plataforma TEXT,
  tipo_contenido TEXT,
  hora_sugerida TEXT,
  hook TEXT,
  copy TEXT,
  cta TEXT,
  hashtags TEXT[],
  objetivo_post TEXT,
  imagen_url TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campana_posts_campana_id ON t_campana_posts(campana_id);
CREATE INDEX idx_campana_posts_campana_semana ON t_campana_posts(campana_id, semana);

ALTER TABLE t_campanas_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_campana_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_campanas_cliente"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_campana_posts"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Nuevos tipos de consumo del wallet compartido (t_transacciones_marketing.tipo)
ALTER TABLE t_transacciones_marketing DROP CONSTRAINT IF EXISTS t_transacciones_marketing_tipo_check;
ALTER TABLE t_transacciones_marketing ADD CONSTRAINT t_transacciones_marketing_tipo_check
  CHECK (tipo IN ('carga', 'generar_promos', 'analizar_identidad', 'generar_imagen', 'analizar_identidad_cliente', 'generar_campana', 'generar_semana_campana', 'generar_imagen_campana'));

COMMENT ON TABLE t_campanas_cliente IS 'Nivel 1: resumen ejecutivo de una campaña + pilares_semanales (JSONB con el eje temático de cada una de las 4 semanas), generados juntos en una sola llamada a Gemini.';
COMMENT ON COLUMN t_campanas_cliente.meta_cuantificable IS 'Meta que escribe el USUARIO (ej. "+500 seguidores"), nunca inventada por la IA — no hay integración real con redes sociales para sustentar métricas de resultado.';
COMMENT ON COLUMN t_campanas_cliente.pilares_semanales IS 'Array JSON con 4 elementos: [{"semana":1,"eje":"Awareness/Introducción","enfoque":"..."}, ...]';
COMMENT ON TABLE t_campana_posts IS 'Nivel 2: posts individuales, generados semana a semana (no el mes completo de una vez) para mantener las respuestas de Gemini cortas y confiables.';
