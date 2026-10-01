-- Identidad visual por cliente: se distingue "logo" (máx. 3) de "trabajo" (imágenes de trabajos
-- gráficos / publicidades ya hechas, máx. 2) para poder trabajar después la identidad visual de
-- cada cliente. Pedido del usuario desde Clientes (antes solo existía, sin distinción de tipo,
-- en el módulo de Campañas de Marketing IA — Fase 5).

ALTER TABLE t_identidad_visual_cliente ADD COLUMN tipo text NOT NULL DEFAULT 'trabajo' CHECK (tipo IN ('logo', 'trabajo'));

-- Límite por cliente y tipo (3 logos, 2 trabajos), rechaza en vez de solo avisar — mismo criterio
-- que el resto del proyecto para reglas de negocio simples.
CREATE OR REPLACE FUNCTION limitar_identidad_visual_cliente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_max int;
  v_count int;
BEGIN
  v_max := CASE WHEN NEW.tipo = 'logo' THEN 3 ELSE 2 END;
  SELECT count(*) INTO v_count FROM t_identidad_visual_cliente WHERE cliente_id = NEW.cliente_id AND tipo = NEW.tipo;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Ya se alcanzó el máximo de % imágenes de tipo "%s" para este cliente', v_max, NEW.tipo;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_limitar_identidad_visual_cliente
BEFORE INSERT ON t_identidad_visual_cliente
FOR EACH ROW EXECUTE FUNCTION limitar_identidad_visual_cliente();
