CREATE TABLE t_conf_condiciones_presupuesto (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE t_conf_condiciones_presupuesto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON t_conf_condiciones_presupuesto FOR ALL TO authenticated USING (true) WITH CHECK (true);
INSERT INTO t_conf_condiciones_presupuesto (nombre) VALUES ('Incluye IVA'), ('Incluye Diseño'), ('Incluye Troquel'), ('Requiere Seña');
-- created_at distinto por fila: JobModal ordena el catálogo por created_at, con timestamps iguales el orden sería arbitrario
UPDATE t_conf_condiciones_presupuesto SET created_at = now() + (CASE nombre WHEN 'Incluye IVA' THEN 0 WHEN 'Incluye Diseño' THEN 1 WHEN 'Incluye Troquel' THEN 2 ELSE 3 END) * interval '1 second';

ALTER TABLE t_trabajos ADD COLUMN condiciones jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE t_trabajos t SET condiciones = COALESCE((
  SELECT jsonb_agg(v.txt ORDER BY v.ord)
  FROM (VALUES
    (1, 'Incluye IVA', COALESCE(t.incluye_iva, false)),
    (2, 'Incluye Diseño', COALESCE(t.incluye_diseno, false)),
    (3, 'Incluye Troquel', COALESCE(t.incluye_troquel, false)),
    (4, 'Requiere Seña', COALESCE(t.requiere_sena, false))
  ) v(ord, txt, flag) WHERE v.flag
), '[]'::jsonb);

COMMENT ON COLUMN t_trabajos.condiciones IS 'Array jsonb con el texto de las condiciones del presupuesto elegidas (snapshot, no FK). Reemplaza a incluye_iva/incluye_diseno/incluye_troquel/requiere_sena, que quedan deprecadas.';
