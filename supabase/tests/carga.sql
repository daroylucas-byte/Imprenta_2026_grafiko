-- ============================================================================================
-- PRUEBA DE CARGA CON PRESUPUESTOS DE TIEMPO — Grafiko
-- Genera un volumen grande de datos sinteticos, mide las consultas y funciones clave COMO USUARIO LOGUEADO (con RLS)
-- y las compara contra un PRESUPUESTO de milisegundos. Si algo lo supera (un indice borrado, una vista cambiada,
-- un trigger nuevo lento) queda marcado como "LENTO".
--
-- COMO SE CORRE: pegar TODO en el SQL Editor de Supabase (o por el MCP execute_sql). Tarda ~20-40 segundos.
-- SIEMPRE termina con un error controlado ("CARGA: ...") que REVIERTE todo: no queda ningun dato de prueba.
--
-- CUANDO: despues de cambiar vistas, indices o triggers, y periodicamente cuando crezcan los datos reales.
-- Escala por defecto: 3.000 clientes, 20.000 trabajos, 60.000 items, 12.000 pagos, 5.000 recibos (mucho mas de lo que
-- va a tener el negocio en los primeros anios). Se puede bajar cambiando las constantes de abajo.
--
-- IMPORTANTE al medir: usar columnas reales (sum(...)) y no count(*) sobre vistas con LEFT JOIN a subconsultas
-- agrupadas: Postgres las simplifica y da tiempos irreales.
-- Los presupuestos son ~4-10 veces lo medido el 2026-09-25 (margen para diferencias de maquina).
-- ============================================================================================
BEGIN;
DO $carga$
DECLARE
  -- ---- escala ----
  n_clientes int := 3000; n_trabajos int := 20000; items_por_trabajo int := 3; n_pagos int := 12000; n_recibos int := 5000;
  -- ----------------
  r text := ''; rep text := ''; fails int := 0; t0 timestamptz; ms numeric; i int;
  v_caja uuid; v_cli uuid; v_trab uuid; arr_lc uuid[]; arr_lt uuid[]; n bigint; v_ntrab bigint; v_nit bigint;
BEGIN
  SELECT id INTO v_caja FROM v_caja_abierta;
  IF v_caja IS NULL THEN INSERT INTO t_aperturas_caja (fecha_apertura, saldo_inicio) VALUES (hoy_ar(), 0) RETURNING id INTO v_caja; END IF;

  -- ===================== CARGA (no se mide) =====================
  CREATE TEMP TABLE lc AS SELECT id, row_number() OVER () rn FROM (SELECT id FROM t_clientes LIMIT 0) x;
  WITH ins AS (INSERT INTO t_clientes (razon_social, nombre, activo) SELECT 'Cli Carga '||g, 'CC'||g, true FROM generate_series(1, n_clientes) g RETURNING id)
  INSERT INTO lc SELECT id, row_number() OVER () FROM ins;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha, fecha_aprobacion, created_at)
  SELECT (SELECT id FROM lc WHERE rn = 1 + (g % n_clientes)), 'Carga '||g, (ARRAY['PRESUPUESTADO','APROBADO','EN PRODUCCIÓN','TERMINADO','ENTREGADO'])[1 + (g % 5)],
         hoy_ar() - (g % 360), CASE WHEN g % 5 = 0 THEN NULL ELSE hoy_ar() - (g % 360) END, now() - ((g % 360) || ' days')::interval
  FROM generate_series(1, n_trabajos) g;
  ALTER TABLE t_trabajo_productos DISABLE TRIGGER trg_recalcular_total_trabajo;   -- solo para armar el volumen rapido
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario)
  SELECT t.id, 'Item '||s, 1 + floor(random()*500), 10 + round((random()*1000)::numeric, 2) FROM t_trabajos t CROSS JOIN generate_series(1, items_por_trabajo) s WHERE t.nombre_trabajo LIKE 'Carga %';
  ALTER TABLE t_trabajo_productos ENABLE TRIGGER trg_recalcular_total_trabajo;
  UPDATE t_trabajos t SET total = s.tot FROM (SELECT trabajo_id, sum(subtotal) tot FROM t_trabajo_productos GROUP BY trabajo_id) s WHERE s.trabajo_id = t.id;
  INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago, fecha)
  SELECT id, cliente_id, round((total*0.4)::numeric,2) + 1, 'pago', (ARRAY['EFECTIVO','TRANSFERENCIA','BANCO'])[1 + floor(random()*3)::int], fecha
  FROM (SELECT * FROM t_trabajos WHERE nombre_trabajo LIKE 'Carga %' AND fecha_aprobacion IS NOT NULL ORDER BY id LIMIT n_pagos) x;
  CREATE TEMP TABLE lt AS SELECT id, row_number() OVER () rn FROM t_trabajos WHERE nombre_trabajo LIKE 'Carga %' AND fecha_aprobacion IS NOT NULL;
  SELECT count(*) INTO n FROM lt;
  INSERT INTO t_recibos (cliente_id, fecha, numero, total) SELECT (SELECT id FROM lc WHERE rn = 1 + (g % n_clientes)), hoy_ar() - (g % 300), 'RC-C'||g, 5000 FROM generate_series(1, n_recibos) g;
  INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado)
  SELECT rc.id, lt.id, 1000 FROM (SELECT id, row_number() OVER () AS k FROM t_recibos WHERE numero LIKE 'RC-C%') rc JOIN lt ON lt.rn = 1 + (rc.k * 7) % n;
  ANALYZE t_clientes; ANALYZE t_trabajos; ANALYZE t_trabajo_productos; ANALYZE t_pagos_trabajo; ANALYZE t_recibos; ANALYZE t_recibo_trabajos; ANALYZE t_movimientos_caja;

  SELECT count(*) INTO v_ntrab FROM t_trabajos; SELECT count(*) INTO v_nit FROM t_trabajo_productos;
  r := format('VOLUMEN: %s trabajos, %s items, %s pagos, %s recibos, %s movimientos en el turno de caja, %s clientes', v_ntrab, v_nit, (SELECT count(*) FROM t_pagos_trabajo), (SELECT count(*) FROM t_recibos), (SELECT count(*) FROM t_movimientos_caja WHERE apertura_caja_id = v_caja), (SELECT count(*) FROM t_clientes)) || E'\n\n';
  SELECT array_agg(id ORDER BY rn) INTO arr_lc FROM lc; SELECT array_agg(id ORDER BY rn) INTO arr_lt FROM lt;
  v_cli := arr_lc[7]; v_trab := arr_lt[100];

  -- ===================== MEDICION (como usuario logueado) =====================
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp(); PERFORM sum(saldo_pendiente) FROM v_saldo_clientes;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 400)', 'Clientes: v_saldo_clientes completa', ms) || E'\n'; IF ms > 400 THEN fails := fails + 1; r := r || 'LENTO Clientes: v_saldo_clientes completa' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_saldo_clientes WHERE id = v_cli;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 150)', 'Cuenta corriente de 1 cliente', ms) || E'\n'; IF ms > 150 THEN fails := fails + 1; r := r || 'LENTO Cuenta corriente de 1 cliente' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_saldo_trabajos;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 800)', 'Ventas/Kanban: v_saldo_trabajos completa (SELECT *)', ms) || E'\n'; IF ms > 800 THEN fails := fails + 1; r := r || 'LENTO Kanban completo' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_saldo_trabajos WHERE id = v_trab;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 60)', 'Abrir 1 trabajo (v_saldo_trabajos WHERE id)', ms) || E'\n'; IF ms > 60 THEN fails := fails + 1; r := r || 'LENTO Abrir 1 trabajo' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_saldo_trabajos WHERE cliente_id = v_cli;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 150)', 'Trabajos de 1 cliente (FIFO / cuenta corriente)', ms) || E'\n'; IF ms > 150 THEN fails := fails + 1; r := r || 'LENTO Trabajos de 1 cliente' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM t_trabajo_productos WHERE trabajo_id = v_trab;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 20)', 'Items de 1 trabajo', ms) || E'\n'; IF ms > 20 THEN fails := fails + 1; r := r || 'LENTO Items de 1 trabajo (falta indice en t_trabajo_productos.trabajo_id?)' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM sum(saldo_pendiente), count(*) FILTER (WHERE estado = 'EN PRODUCCIÓN') FROM v_metricas_trabajos;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 400)', 'Dashboard: v_metricas_trabajos', ms) || E'\n'; IF ms > 400 THEN fails := fails + 1; r := r || 'LENTO Dashboard v_metricas_trabajos' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM ranking_clientes(NULL, NULL, 10);
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 500)', 'Dashboard: ranking_clientes (todo el historial)', ms) || E'\n'; IF ms > 500 THEN fails := fails + 1; r := r || 'LENTO ranking_clientes' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM sum(importe) FROM t_pagos_trabajo WHERE fecha >= hoy_ar() - 180;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 60)', 'Dashboard: cobros de los ultimos 6 meses', ms) || E'\n'; IF ms > 60 THEN fails := fails + 1; r := r || 'LENTO cobros de 6 meses (falta indice en t_pagos_trabajo.fecha?)' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_caja_efectivo_actual;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 150)', 'Caja: v_caja_efectivo_actual', ms) || E'\n'; IF ms > 150 THEN fails := fails + 1; r := r || 'LENTO v_caja_efectivo_actual' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM * FROM v_caja_desglose_metodos;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 600)', 'Caja: v_caja_desglose_metodos (turno grande)', ms) || E'\n'; IF ms > 600 THEN fails := fails + 1; r := r || 'LENTO v_caja_desglose_metodos' || E'\n'; END IF;
  t0 := clock_timestamp(); PERFORM count(*) FROM v_margen_trabajo;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 400)', 'v_margen_trabajo completa', ms) || E'\n'; IF ms > 400 THEN fails := fails + 1; r := r || 'LENTO v_margen_trabajo' || E'\n'; END IF;

  t0 := clock_timestamp();
  FOR i IN 1..30 LOOP
    DELETE FROM t_trabajo_productos WHERE trabajo_id = arr_lt[400 + i];
    INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) SELECT arr_lt[400 + i], 'Item '||s, 10, 100 FROM generate_series(1,5) s;
  END LOOP;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000/30, 1); rep := rep || format('%-70s %8s ms  (presupuesto 15)', 'GUARDAR un trabajo (borrar + reinsertar 5 items, como JobModal) [promedio]', ms) || E'\n'; IF ms > 15 THEN fails := fails + 1; r := r || 'LENTO guardar un trabajo (trigger recalcular_total_trabajo sin indice?)' || E'\n'; END IF;
  t0 := clock_timestamp(); FOR i IN 1..30 LOOP UPDATE t_trabajo_productos SET cantidad = cantidad + 1 WHERE id = (SELECT id FROM t_trabajo_productos WHERE trabajo_id = arr_lt[600 + i] LIMIT 1); END LOOP;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000/30, 1); rep := rep || format('%-70s %8s ms  (presupuesto 8)', 'Editar 1 item [promedio]', ms) || E'\n'; IF ms > 8 THEN fails := fails + 1; r := r || 'LENTO editar un item' || E'\n'; END IF;
  t0 := clock_timestamp(); FOR i IN 1..30 LOOP PERFORM registrar_cobro_con_fifo(arr_lc[10 + i], 50, 'Efectivo'); END LOOP;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000/30, 1); rep := rep || format('%-70s %8s ms  (presupuesto 120)', 'FN registrar_cobro_con_fifo [promedio]', ms) || E'\n'; IF ms > 120 THEN fails := fails + 1; r := r || 'LENTO registrar_cobro_con_fifo' || E'\n'; END IF;
  t0 := clock_timestamp(); FOR i IN 1..30 LOOP PERFORM duplicar_trabajo(arr_lt[900 + i], NULL); END LOOP;
  ms := round(extract(epoch from clock_timestamp()-t0)*1000/30, 1); rep := rep || format('%-70s %8s ms  (presupuesto 15)', 'FN duplicar_trabajo [promedio]', ms) || E'\n'; IF ms > 15 THEN fails := fails + 1; r := r || 'LENTO duplicar_trabajo' || E'\n'; END IF;
  RESET ROLE;

  t0 := clock_timestamp(); PERFORM cerrar_y_reabrir_caja(v_caja, 100000000, 0, NULL, NULL, NULL);
  ms := round(extract(epoch from clock_timestamp()-t0)*1000, 1); rep := rep || format('%-70s %8s ms  (presupuesto 1000)', 'FN cerrar_y_reabrir_caja con el turno grande', ms) || E'\n'; IF ms > 1000 THEN fails := fails + 1; r := r || 'LENTO cerrar_y_reabrir_caja' || E'\n'; END IF;

  RAISE EXCEPTION '%', 'CARGA: ' || fails || ' medicion(es) LENTA(S)' || E'\n' || r || E'\n' || rep || E'\n(Este error es intencional: revierte todos los datos de prueba.)';
END $carga$;
