CREATE OR REPLACE FUNCTION cerrar_y_reabrir_caja(
  p_apertura_id uuid,
  p_saldo_contado numeric,
  p_monto_retiro numeric DEFAULT 0,
  p_metodo_retiro text DEFAULT NULL,
  p_motivo_retiro text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL
)
RETURNS TABLE(nueva_apertura_id uuid, saldo_inicio_nuevo numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_nueva_apertura_id uuid;
  v_saldo_inicio_nuevo numeric;
BEGIN
  IF p_saldo_contado IS NULL OR p_saldo_contado < 0 THEN
    RAISE EXCEPTION 'El saldo contado debe ser mayor o igual a cero';
  END IF;
  IF p_monto_retiro IS NULL OR p_monto_retiro < 0 THEN
    RAISE EXCEPTION 'El monto del retiro no puede ser negativo';
  END IF;
  IF p_monto_retiro > p_saldo_contado THEN
    RAISE EXCEPTION 'No se puede retirar más de lo contado en el arqueo';
  END IF;

  -- 1. Si hay retiro, registrarlo como egreso del turno que se está cerrando
  IF p_monto_retiro > 0 THEN
    INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, metodo, monto, descripcion, usuario_id)
    VALUES (p_apertura_id, 'egreso', COALESCE(p_metodo_retiro, 'Efectivo'), p_monto_retiro, COALESCE(p_motivo_retiro, 'Retiro al cerrar caja'), p_usuario_id);
  END IF;

  -- 2. Cerrar el turno actual. saldo_cierre documenta el arqueo real (antes del retiro).
  UPDATE t_aperturas_caja
  SET fecha_cierre = CURRENT_DATE, saldo_cierre = p_saldo_contado
  WHERE id = p_apertura_id;

  -- 3. Reabrir inmediatamente con lo que queda, para que la caja nunca quede sin cobertura.
  v_saldo_inicio_nuevo := p_saldo_contado - p_monto_retiro;

  INSERT INTO t_aperturas_caja (usuario_id, fecha_apertura, saldo_inicio, fecha_cierre, saldo_cierre)
  VALUES (p_usuario_id, CURRENT_DATE, v_saldo_inicio_nuevo, NULL, NULL)
  RETURNING id INTO v_nueva_apertura_id;

  RETURN QUERY SELECT v_nueva_apertura_id, v_saldo_inicio_nuevo;
END;
$$;

COMMENT ON FUNCTION cerrar_y_reabrir_caja IS 'Cierra el turno de caja actual (arqueo) y abre uno nuevo en el mismo movimiento, para que la caja nunca quede cerrada (evita cobros sin caja abierta). Si p_monto_retiro > 0, lo registra como egreso del turno que se cierra antes de cerrarlo. saldo_cierre guarda el monto contado antes del retiro; el turno nuevo arranca con saldo_contado - retiro.';
