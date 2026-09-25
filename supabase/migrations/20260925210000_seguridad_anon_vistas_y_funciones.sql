-- Hardening de seguridad (auditoria 2026-09-25).
-- Hallazgo: la anon key (publica, va en el bundle) permitia SIN LOGIN:
--   * leer vistas (v_saldo_clientes, clientes, ventas, ...) porque eran SECURITY DEFINER y saltean RLS;
--   * ejecutar funciones SECURITY DEFINER (registrar_cobro_con_fifo, cargar_saldo_marketing, ...).
-- Las tablas ya estaban bien protegidas (RLS solo para authenticated).

-- 1) Vistas: que respeten los permisos/RLS de quien consulta (no los del owner)
DO $$
DECLARE v record;
BEGIN
  FOR v IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
  END LOOP;
END $$;

-- 2) anon no debe tener NINGUN permiso sobre el schema public (la app siempre requiere login)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

-- 3) Funciones: solo usuarios logueados (y service_role para las Edge Functions/backend ARCA)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- 4) search_path fijo en las funciones propias (evita secuestro por objetos con el mismo nombre en otro schema)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.sig);
  END LOOP;
END $$;
