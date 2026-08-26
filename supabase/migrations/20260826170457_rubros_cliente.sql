CREATE TABLE t_conf_rubros_cliente (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  nombre character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE t_conf_rubros_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON t_conf_rubros_cliente
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE t_clientes ADD COLUMN rubro_id uuid REFERENCES t_conf_rubros_cliente(id);

COMMENT ON TABLE t_conf_rubros_cliente IS 'Tabla paramétrica de rubros/industrias de clientes, configurable desde /configuracion.';
COMMENT ON COLUMN t_clientes.rubro_id IS 'FK a t_conf_rubros_cliente. La columna vieja t_clientes.rubro (texto libre) queda sin uso desde el frontend, no se migró automáticamente.';
