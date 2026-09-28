-- Fase 2 del plan de mejora de la base (2026-09-28): invariantes de integridad para la CUENTA CORRIENTE
-- DEL CLIENTE, que es la fuente de verdad de la plata (decision del usuario: "lo mas importante es la
-- cuenta corriente del cliente"). Hasta ahora estas reglas solo vivian en las funciones (registrar_cobro_con_fifo,
-- aplicar_credito_a_trabajos); si algun camino futuro escribiera distinto, no habia nada que lo frenara.
-- Se agregan como triggers BEFORE INSERT: rechazan (no solo marcan), igual que el resto de las protecciones
-- del proyecto (stock, compras).
--
-- Nota sobre "por defecto impacta en caja": ya es el comportamiento actual — registrar_cobro_con_fifo,
-- registrar_pago_proveedor y el trigger trg_pago_trabajo_a_caja registran el ingreso en la caja abierta
-- automaticamente. No hace falta cambiar nada ahi; queda confirmado y con chequeo en la regresion.
--
-- Deliberadamente NO se bloquea aplicar credito a un trabajo PRESUPUESTADO (sin aprobar) cuando se elige
-- un trabajo puntual: es una accion explicita del usuario (aplicar_credito_a_trabajos con p_trabajo_id),
-- ya probada y aceptada en la Fase 0. Lo que se bloquea siempre, sin excepcion, es ANULADO/CANCELADO.

-- 1) t_recibo_trabajos: nunca a un trabajo anulado/cancelado, nunca de mas del total del recibo
CREATE OR REPLACE FUNCTION proteger_recibo_trabajo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_estado text;
  v_total_recibo numeric;
  v_ya_aplicado numeric;
BEGIN
  IF NEW.monto_aplicado IS NULL OR NEW.monto_aplicado <= 0 THEN
    RAISE EXCEPTION 'El monto aplicado debe ser mayor a cero';
  END IF;

  SELECT estado INTO v_estado FROM t_trabajos WHERE id = NEW.trabajo_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El trabajo al que se quiere aplicar el cobro no existe';
  END IF;
  IF v_estado IN ('ANULADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'No se puede aplicar un cobro a un trabajo %', v_estado;
  END IF;

  SELECT total INTO v_total_recibo FROM t_recibos WHERE id = NEW.recibo_id;
  IF v_total_recibo IS NULL THEN
    RAISE EXCEPTION 'El recibo no existe';
  END IF;
  SELECT COALESCE(sum(monto_aplicado), 0) INTO v_ya_aplicado FROM t_recibo_trabajos WHERE recibo_id = NEW.recibo_id;
  IF v_ya_aplicado + NEW.monto_aplicado > v_total_recibo + 0.01 THEN
    RAISE EXCEPTION 'La aplicación (%) supera lo disponible del recibo: total %, ya aplicado %', NEW.monto_aplicado, v_total_recibo, v_ya_aplicado;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_proteger_recibo_trabajo
BEFORE INSERT ON t_recibo_trabajos
FOR EACH ROW EXECUTE FUNCTION proteger_recibo_trabajo();

-- 2) t_pagos_trabajo: nunca un pago directo a un trabajo anulado/cancelado
CREATE OR REPLACE FUNCTION proteger_pago_trabajo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_estado text;
BEGIN
  IF NEW.importe IS NOT NULL AND NEW.importe <= 0 THEN
    RAISE EXCEPTION 'El importe del pago debe ser mayor a cero';
  END IF;

  SELECT estado INTO v_estado FROM t_trabajos WHERE id = NEW.trabajo_id;
  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'El trabajo al que se quiere registrar el pago no existe';
  END IF;
  IF v_estado IN ('ANULADO', 'CANCELADO') THEN
    RAISE EXCEPTION 'No se puede registrar un pago sobre un trabajo %', v_estado;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_proteger_pago_trabajo
BEFORE INSERT ON t_pagos_trabajo
FOR EACH ROW EXECUTE FUNCTION proteger_pago_trabajo();
