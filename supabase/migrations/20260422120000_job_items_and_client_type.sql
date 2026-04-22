-- 1. Update t_clientes to include wholesale status
ALTER TABLE "public"."t_clientes" 
ADD COLUMN IF NOT EXISTS "es_mayorista" boolean DEFAULT false;

COMMENT ON COLUMN "public"."t_clientes"."es_mayorista" IS 'Indica si el cliente es mayorista (para selección automática de precios)';

-- 2. Create t_trabajo_productos for line items
CREATE TABLE IF NOT EXISTS "public"."t_trabajo_productos" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    "trabajo_id" uuid REFERENCES "public"."t_trabajos"("id") ON DELETE CASCADE,
    "producto_id" uuid REFERENCES "public"."t_productos"("id"),
    "cantidad" integer DEFAULT 1,
    "tipo_precio" character varying(20) DEFAULT 'minorista', -- 'minorista' or 'mayorista'
    "precio_unitario" numeric(12,2) DEFAULT 0,
    "subtotal" numeric(12,2) DEFAULT 0,
    "numeracion_desde" character varying(100),
    "numeracion_hasta" character varying(100),
    "fecha_muestra" date,
    "created_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "t_trabajo_productos_pkey" PRIMARY KEY ("id")
);

-- RLS for the new table (assuming public access or authenticated like others)
ALTER TABLE "public"."t_trabajo_productos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to authenticated" ON "public"."t_trabajo_productos"
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Add link fields or comments for clarification on t_trabajos
-- We keep t_trabajos.total as the aggregate sum.
COMMENT ON TABLE "public"."t_trabajo_productos" IS 'Items de productos asociados a un trabajo de producción';
