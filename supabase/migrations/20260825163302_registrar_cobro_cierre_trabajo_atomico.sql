CREATE OR REPLACE FUNCTION registrar_cobro_cierre_trabajo(
  p_trabajo_id uuid,
  p_cliente_id uuid,
  p_importe numeric,
  p_metodo text,
  p_descuento_pct numeric DEFAULT 0,
  p_observaciones text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_actual numeric;
  v_monto_descuento numeric := 0;
  v_nota text;
BEGIN
  SELECT saldo_pendiente INTO v_saldo_actual FROM v_saldo_trabajos WHERE id = p_trabajo_id;

  IF p_descuento_pct > 0 THEN
    v_monto_descuento := ROUND(COALESCE(v_saldo_actual, 0) * (p_descuento_pct / 100), 2);
    UPDATE t_trabajos SET total = total - v_monto_descuento WHERE id = p_trabajo_id;
    v_nota := 'Descuento ' || p_descuento_pct || '% aplicado al cerrar el trabajo (-$' || v_monto_descuento || ')';
  END IF;

  INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago, fecha, observaciones)
  VALUES (
    p_trabajo_id,
    p_cliente_id,
    p_importe,
    'pago',
    p_metodo,
    CURRENT_DATE,
    CASE
      WHEN v_nota IS NOT NULL AND COALESCE(p_observaciones, '') <> '' THEN v_nota || ' — ' || p_observaciones
      WHEN v_nota IS NOT NULL THEN v_nota
      WHEN COALESCE(p_observaciones, '') <> '' THEN p_observaciones
      ELSE 'Cobro al cerrar el trabajo'
    END
  );
END;
$$;

COMMENT ON FUNCTION registrar_cobro_cierre_trabajo IS 'Registra atómicamente el cobro obligatorio al pasar un trabajo a TERMINADO/ENTREGADO: si hay descuento, reduce t_trabajos.total y luego inserta el pago en la misma transacción (si el insert falla, el UPDATE del total se revierte también).';
