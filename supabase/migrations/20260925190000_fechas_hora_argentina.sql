-- Fechas de negocio en hora argentina.
-- El servidor corre en UTC: CURRENT_DATE devuelve el dia SIGUIENTE entre las 21:00 y las 24:00 (UTC-3).
-- hoy_ar() devuelve la fecha de calendario de Argentina y reemplaza a CURRENT_DATE en el negocio.
CREATE OR REPLACE FUNCTION hoy_ar()
RETURNS date
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date $$;

-- Reemplazar CURRENT_DATE por hoy_ar() en todas las funciones del schema public
-- (incluye valores por defecto de argumentos, ej. registrar_cobro_con_fifo.p_fecha).
-- Se reescribe la definicion existente tal cual (security, lenguaje, etc.), solo cambia la fecha.
DO $mig$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.proname <> 'hoy_ar'
      AND pg_get_functiondef(p.oid) ~* 'current_date'
  LOOP
    EXECUTE regexp_replace(pg_get_functiondef(f.oid), 'CURRENT_DATE', 'hoy_ar()', 'gi');
  END LOOP;
END
$mig$;

-- Valores por defecto de columnas
ALTER TABLE t_trabajos          ALTER COLUMN fecha SET DEFAULT hoy_ar();
ALTER TABLE t_pagos_trabajo     ALTER COLUMN fecha SET DEFAULT hoy_ar();
ALTER TABLE t_recibos           ALTER COLUMN fecha SET DEFAULT hoy_ar();
ALTER TABLE t_ajustes_cc        ALTER COLUMN fecha SET DEFAULT hoy_ar();
ALTER TABLE t_comprobantes      ALTER COLUMN fecha SET DEFAULT hoy_ar();
ALTER TABLE t_comprobante_cobros ALTER COLUMN fecha SET DEFAULT hoy_ar();
