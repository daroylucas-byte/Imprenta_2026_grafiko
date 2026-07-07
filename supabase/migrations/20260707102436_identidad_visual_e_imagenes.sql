-- Imágenes de referencia subidas por el usuario (logo, flyers viejos, fotos del local)
CREATE TABLE t_identidad_visual (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imagen_url TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resultado del análisis de identidad visual (singleton: el análisis vigente más reciente)
CREATE TABLE t_analisis_identidad (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  estilo_descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- La imagen generada para una promoción vive en la propia promoción (una promoción -> un flyer)
ALTER TABLE t_promociones ADD COLUMN imagen_url TEXT;

-- Nuevos tipos de consumo del wallet de marketing
ALTER TABLE t_transacciones_marketing DROP CONSTRAINT t_transacciones_marketing_tipo_check;
ALTER TABLE t_transacciones_marketing ADD CONSTRAINT t_transacciones_marketing_tipo_check
  CHECK (tipo IN ('carga', 'generar_promos', 'analizar_identidad', 'generar_imagen'));

ALTER TABLE t_identidad_visual ENABLE ROW LEVEL SECURITY;
ALTER TABLE t_analisis_identidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_identidad_visual"
FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to authenticated" ON "public"."t_analisis_identidad"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE t_identidad_visual IS 'Imágenes de referencia (logo, flyers viejos, fotos del local) subidas por el usuario para que la IA aprenda el estilo visual del negocio.';
COMMENT ON TABLE t_analisis_identidad IS 'Resultado (singleton) del análisis de identidad visual hecho por Gemini a partir de t_identidad_visual: paleta, tono, estilo. Se reusa como contexto en cada generación de imagen.';
COMMENT ON COLUMN t_promociones.imagen_url IS 'URL pública en el bucket de Storage "marketing" del flyer generado para esta promoción, si se generó alguno.';
