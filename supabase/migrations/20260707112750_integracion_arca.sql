-- Integración con el backend ARCA/AFIP externo (VPS, /root/arca-backend, ya en
-- producción para otros clientes). Ese backend espera un esquema genérico
-- (ventas, clientes, configuracion, facturas_arca) que Grafiko no tiene — usa
-- t_trabajos/t_clientes en su lugar. En vez de duplicar datos, se crean vistas
-- de solo lectura/escritura controlada sobre las tablas reales, así el backend
-- externo puede seguir sin modificarse y Grafiko no duplica ninguna información.
--
-- localId es un concepto de multi-sucursal que Grafiko no tiene (single-tenant):
-- se usa el valor fijo 'principal' en la config y en cada llamada desde el frontend.

-- Tabla nueva: configuración de servicios externos (por ahora solo ARCA).
-- Estructura esperada por el backend: servicios -> arca -> <localId> -> {...}
CREATE TABLE configuracion (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  servicios JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO configuracion (id, servicios) VALUES (1, '{}'::jsonb);

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON "public"."configuracion"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE configuracion IS 'Config genérica de servicios externos, requerida por el backend ARCA externo (VPS). Estructura: servicios.arca.<localId> = { punto_venta, modo, cuit, certificado_crt, clave_privada_key, condicion_iva }. certificado_crt y clave_privada_key son sensibles: nunca exponer en el cliente, solo se leen server-side (service_role) desde el VPS.';

-- Tabla nueva: registro de comprobantes emitidos vía ARCA. Columnas exactas
-- que el backend externo inserta (no renombrar sin coordinar con ese código).
CREATE TABLE facturas_arca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL,
  venta_id UUID NOT NULL,
  tipo_comprobante TEXT NOT NULL,
  punto_venta INT,
  numero_comprobante INT,
  receptor_tipo_doc TEXT,
  receptor_cuit_dni TEXT,
  receptor_razon_social TEXT,
  receptor_iva_cond TEXT,
  concepto TEXT,
  neto_gravado NUMERIC(12,2),
  iva_alicuota NUMERIC(5,2),
  iva_monto NUMERIC(12,2),
  total NUMERIC(12,2),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  cae TEXT,
  cae_vencimiento TIMESTAMPTZ,
  error_mensaje TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facturas_arca_venta_id ON facturas_arca(venta_id);

ALTER TABLE facturas_arca ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON "public"."facturas_arca"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE facturas_arca IS 'Comprobantes emitidos (o intentos fallidos) vía el backend ARCA externo. venta_id referencia a t_trabajos.id a través de la vista "ventas", no hay FK directa porque el backend externo no conoce t_trabajos.';

-- Vista "clientes": expone t_clientes con los nombres de columna que el
-- backend ARCA espera (cuit, razon_social, iva_cond).
CREATE VIEW clientes AS
SELECT
  c.id,
  c.razon_social,
  c.cuit,
  CASE
    WHEN c.situacion_iva ILIKE '%responsable%inscripto%' THEN 'responsable_inscripto'
    WHEN c.situacion_iva ILIKE '%monotribut%' THEN 'monotributo'
    WHEN c.situacion_iva ILIKE '%exento%' THEN 'exento'
    ELSE 'consumidor_final'
  END AS iva_cond
FROM t_clientes c;

COMMENT ON VIEW clientes IS 'Vista de solo lectura sobre t_clientes, para el backend ARCA externo. iva_cond se normaliza desde t_clientes.situacion_iva.';

-- Vista "ventas": expone t_trabajos con los nombres que el backend ARCA espera.
-- estado se calcula desde t_trabajos.facturado (boolean), NO desde
-- t_trabajos.estado (que es el estado real del Kanban de producción y no debe
-- ser pisado por la facturación).
CREATE VIEW ventas AS
SELECT
  t.id,
  t.cliente_id,
  t.total,
  CASE WHEN t.facturado THEN 'facturado' ELSE 'pendiente' END AS estado,
  t.created_at
FROM t_trabajos t;

COMMENT ON VIEW ventas IS 'Vista sobre t_trabajos para el backend ARCA externo. El campo estado NO es t_trabajos.estado (que es el estado de producción del Kanban) sino que se deriva de t_trabajos.facturado. Tiene un trigger INSTEAD OF UPDATE (ver trg_ventas_update) para que el UPDATE ventas SET estado=... del backend externo actualice facturado en vez de pisar el estado de producción.';

-- Trigger: intercepta UPDATE sobre la vista "ventas" (el backend externo hace
-- UPDATE ventas SET estado = 'facturado' WHERE id = ventaId tras emitir el CAE)
-- y lo redirige a t_trabajos.facturado, sin tocar t_trabajos.estado.
CREATE OR REPLACE FUNCTION trg_ventas_update_fn()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE t_trabajos
  SET facturado = (NEW.estado = 'facturado')
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ventas_update
INSTEAD OF UPDATE ON ventas
FOR EACH ROW
EXECUTE FUNCTION trg_ventas_update_fn();
