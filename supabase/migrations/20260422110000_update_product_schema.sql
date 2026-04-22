-- Update t_productos schema
ALTER TABLE "public"."t_productos" 
DROP COLUMN IF EXISTS "stock",
DROP COLUMN IF EXISTS "precio",
ADD COLUMN IF NOT EXISTS "precio_costo" numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "precio_minorista" numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "precio_mayorista" numeric(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "requiere_numeracion" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "requiere_fecha_muestra" boolean DEFAULT false;

-- Add comments for the new columns
COMMENT ON COLUMN "public"."t_productos"."precio_costo" IS 'Precio de costo del producto';
COMMENT ON COLUMN "public"."t_productos"."precio_minorista" IS 'Precio de venta para consumidor final';
COMMENT ON COLUMN "public"."t_productos"."precio_mayorista" IS 'Precio de venta para clientes mayoristas';
COMMENT ON COLUMN "public"."t_productos"."requiere_numeracion" IS 'Indica si el producto (ej. talonario) requiere seguimiento de numeración';
COMMENT ON COLUMN "public"."t_productos"."requiere_fecha_muestra" IS 'Indica si el producto requiere una fecha de muestra para el cliente';
