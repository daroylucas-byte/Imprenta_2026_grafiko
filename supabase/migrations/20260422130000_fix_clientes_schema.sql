-- Fix missing columns in t_clientes
ALTER TABLE "public"."t_clientes" ADD COLUMN IF NOT EXISTS "inicio_actividad" date;
ALTER TABLE "public"."t_clientes" ADD COLUMN IF NOT EXISTS "es_mayorista" boolean DEFAULT false;
ALTER TABLE "public"."t_clientes" ADD COLUMN IF NOT EXISTS "rubro" character varying(255);
ALTER TABLE "public"."t_clientes" ADD COLUMN IF NOT EXISTS "nro_iibb" character varying(50);
ALTER TABLE "public"."t_clientes" ADD COLUMN IF NOT EXISTS "situacion_iva" character varying(100) DEFAULT 'Ninguno';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
