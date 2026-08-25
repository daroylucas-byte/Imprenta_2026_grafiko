CREATE OR REPLACE FUNCTION aplicar_credito_a_trabajos(
  p_cliente_id uuid,
  p_trabajo_id uuid DEFAULT NULL
)
RETURNS TABLE(aplicaciones_creadas integer, monto_total_aplicado numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_receipt RECORD;
  v_job RECORD;
  v_disponible numeric;
  v_to_apply numeric;
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  FOR v_receipt IN
    SELECT r.id, r.total - COALESCE(SUM(rt.monto_aplicado), 0) AS disponible
    FROM t_recibos r
    LEFT JOIN t_recibo_trabajos rt ON rt.recibo_id = r.id
    WHERE r.cliente_id = p_cliente_id
    GROUP BY r.id, r.total, r.fecha
    HAVING r.total - COALESCE(SUM(rt.monto_aplicado), 0) > 0
    ORDER BY r.fecha ASC
  LOOP
    v_disponible := v_receipt.disponible;
    IF v_disponible <= 0 THEN CONTINUE; END IF;

    FOR v_job IN
      SELECT vt.id, vt.saldo_pendiente
      FROM v_saldo_trabajos vt
      WHERE vt.cliente_id = p_cliente_id
        AND vt.saldo_pendiente > 0
        AND (p_trabajo_id IS NULL OR vt.id = p_trabajo_id)
      ORDER BY vt.fecha_aprobacion ASC NULLS LAST
    LOOP
      IF v_disponible <= 0 THEN EXIT; END IF;
      v_to_apply := LEAST(v_disponible, v_job.saldo_pendiente);
      IF v_to_apply <= 0 THEN CONTINUE; END IF;

      INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado)
      VALUES (v_receipt.id, v_job.id, v_to_apply);

      v_disponible := v_disponible - v_to_apply;
      v_count := v_count + 1;
      v_total := v_total + v_to_apply;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_count, v_total;
END;
$$;

COMMENT ON FUNCTION aplicar_credito_a_trabajos IS 'Reparte FIFO el crédito disponible (recibos sin aplicar) de un cliente contra trabajos con saldo pendiente. Si p_trabajo_id es NULL aplica contra todos los trabajos pendientes del cliente (uso desde ClientLedgerModal); si se pasa un p_trabajo_id, solo contra ese trabajo (uso desde JobModal). Unifica la lógica que antes estaba duplicada (y rota, con nombres de columna incorrectos) en el frontend.';
