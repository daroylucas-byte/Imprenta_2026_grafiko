-- Add missing 'fecha' column to t_comprobante_cobros
ALTER TABLE IF EXISTS "public"."t_comprobante_cobros" 
ADD COLUMN IF NOT EXISTS "fecha" date DEFAULT CURRENT_DATE;

-- Add comment for documentation
COMMENT ON COLUMN "public"."t_comprobante_cobros"."fecha" IS 'Fecha en la que se realizó el cobro/pago';
