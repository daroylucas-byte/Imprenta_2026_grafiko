-- Hallazgo de la bateria de regresion (14b): las funciones creadas DESPUES del endurecimiento de seguridad
-- (insumos, compras, costeo) quedaron con EXECUTE para PUBLIC, o sea ejecutables por `anon`.
-- Causa: ALTER DEFAULT PRIVILEGES ... IN SCHEMA public REVOKE ... FROM PUBLIC no tiene efecto (un default por schema solo
-- puede AGREGAR permisos; el EXECUTE a PUBLIC lo da el default GLOBAL de Postgres y solo se quita a nivel global).
-- Riesgo real: bajo (todas son SECURITY INVOKER y anon no tiene acceso a ninguna tabla), pero la defensa en capas estaba rota.

-- 1) Las funciones existentes
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- 2) Las funciones futuras: revocar el EXECUTE por defecto a PUBLIC A NIVEL GLOBAL para el rol que crea las migraciones
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
