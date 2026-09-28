-- Keepalive: evita que Supabase pause el proyecto por inactividad (plan gratuito, se pausa tras
-- ~7 dias sin actividad en la base). Un cron diario actualiza una fila singleton con la fecha y un
-- numero al azar. No tiene ningun uso de negocio; es solo para generar actividad en la base.
--
-- Seguridad: RLS activada, SIN policies a proposito. No se expone por la API (PostgREST) — el cron
-- corre server-side (pg_cron), que no pasa por RLS al ser ejecutado por el owner de la base.
-- anon queda sin ningun permiso sobre la tabla; authenticated tiene el GRANT automatico de Supabase
-- para tablas nuevas de public pero, sin policies, cualquier SELECT le devuelve 0 filas y cualquier
-- escritura se rechaza — no hace falta nada mas porque el contenido no es sensible.

CREATE TABLE t_keepalive (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fecha timestamptz NOT NULL DEFAULT now(),
  numero_random integer NOT NULL DEFAULT 0
);
INSERT INTO t_keepalive (id, fecha, numero_random) VALUES (1, now(), 0);
ALTER TABLE t_keepalive ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION keepalive_ping()
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE t_keepalive
  SET fecha = now(), numero_random = floor(random() * 1000000)::int
  WHERE id = 1;
END;
$function$;

-- Diario a las 09:00 UTC (06:00 hora Argentina). cron.schedule es idempotente por nombre de job:
-- si se vuelve a correr esta migracion, actualiza el mismo job en vez de duplicarlo.
SELECT cron.schedule('keepalive_ping', '0 9 * * *', $cron$SELECT keepalive_ping();$cron$);
