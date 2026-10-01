-- Imágenes aisladas por cliente (Fase 5b): generación directa de una imagen puntual (no atada a un
-- post de campaña ni a una promoción), con controles explícitos de tamaño, ubicación del logo,
-- contexto y textos obligatorios. Salida: hasta 3 alternativas por generación.

ALTER TABLE t_transacciones_marketing DROP CONSTRAINT t_transacciones_marketing_tipo_check;
ALTER TABLE t_transacciones_marketing ADD CONSTRAINT t_transacciones_marketing_tipo_check
  CHECK (tipo = ANY (ARRAY['carga','generar_promos','analizar_identidad','generar_imagen','analizar_identidad_cliente','generar_campana','generar_semana_campana','generar_imagen_campana','generar_imagen_aislada']::text[]));

CREATE TABLE t_imagenes_aisladas_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES t_clientes(id) ON DELETE CASCADE,
  ancho_px integer NOT NULL CHECK (ancho_px > 0),
  alto_px integer NOT NULL CHECK (alto_px > 0),
  logo_ubicacion text NOT NULL CHECK (logo_ubicacion IN ('superior_izquierda','superior_derecha','inferior_izquierda','inferior_derecha','centro','sin_logo')),
  informacion text NOT NULL,
  textos_obligatorios jsonb NOT NULL DEFAULT '[]'::jsonb,
  imagenes_url jsonb NOT NULL DEFAULT '[]'::jsonb,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_imagenes_aisladas_cliente ON t_imagenes_aisladas_cliente(cliente_id);
ALTER TABLE t_imagenes_aisladas_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_imagenes_aisladas_cliente FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE VIEW v_imagenes_aisladas_cliente WITH (security_invoker = true) AS
SELECT
  i.id, i.cliente_id, c.razon_social AS cliente_nombre,
  i.ancho_px, i.alto_px, i.logo_ubicacion, i.informacion, i.textos_obligatorios, i.imagenes_url,
  i.usuario_id, i.created_at
FROM t_imagenes_aisladas_cliente i
JOIN t_clientes c ON c.id = i.cliente_id;
