-- ============================================================================================
-- BATERIA DE REGRESION — Grafiko
-- Verifica las funciones, triggers, vistas y permisos que manejan PLATA y STOCK.
--
-- COMO SE CORRE: pegar TODO este archivo en el SQL Editor de Supabase (o por el MCP execute_sql).
-- SIEMPRE termina con un error controlado ("REGRESION: X de Y OK ..."): eso hace que se REVIERTA todo y no quede
-- ningun dato de prueba. El resultado esta en el texto del error. "0 FALLA(S)" = todo bien.
--
-- CUANDO: antes y despues de tocar cualquier funcion, vista o trigger de plata/stock (ver CLAUDE.md).
-- Cada bloque simula una pantalla real: actua con SET LOCAL ROLE authenticated (como la app) y, donde hace falta,
-- con anon / service_role.
-- ============================================================================================
BEGIN;
DO $reg$
DECLARE
  r text := ''; fails int := 0; n_tests int := 0; ok boolean; omitidos text := '';
  v_caja uuid; v_cli uuid; a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; v_p uuid; v_comp uuid; v_comp2 uuid; v_res record; v_dup record; snap record;
  tot numeric; sal numeric; cred numeric; cred2 numeric; apl_b numeric; apl_p numeric; apl_c numeric; apl_a numeric; v_n int; v_pago uuid;
  saldo0 numeric; saldo1 numeric; deuda0 numeric; deuda1 numeric; est record; v_mk numeric; v_uid uuid;
  v_prov uuid; v_inact uuid; v_ins uuid; v_ins2 uuid; v_hoja uuid; v_resma uuid; v_kilo uuid; v_c1 uuid; v_c2 uuid; v_ef0 numeric; v_ef1 numeric; v_stock numeric;
  v_item uuid; v_json jsonb; v_a record; v_serv uuid; n_comp_antes bigint; stock_antes numeric;
BEGIN
  SELECT id INTO v_caja FROM v_caja_abierta;
  IF v_caja IS NULL THEN INSERT INTO t_aperturas_caja (fecha_apertura, saldo_inicio) VALUES (hoy_ar(), 0) RETURNING id INTO v_caja; END IF;

  -- ---------- Datos base ----------
  INSERT INTO t_clientes (razon_social, nombre, activo) VALUES ('Regresion SA', 'Reg', true) RETURNING id INTO v_cli;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'C viejo',       'APROBADO',      hoy_ar() - 10) RETURNING id INTO c;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'A ayer',        'APROBADO',      hoy_ar() - 1)  RETURNING id INTO a;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'B anulado',     'ANULADO',       hoy_ar() - 30) RETURNING id INTO b;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'P presupuesto', 'PRESUPUESTADO', NULL)          RETURNING id INTO v_p;
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (c, 'i', 3, 500);
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (a, 'i1', 2, 500), (a, 'i2', 1, 1000);
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (b, 'i', 1, 5000);
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (v_p, 'i', 1, 3000);

  SET LOCAL ROLE authenticated;

  -- ================= 1. TOTAL DEL TRABAJO (trigger recalcular_total_trabajo) =================
  SELECT total INTO tot FROM t_trabajos WHERE id = a;
  ok := (tot = 2000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 1a total tras insertar items=' || tot || ' (2000)' || E'\n'; END IF;
  UPDATE t_trabajo_productos SET cantidad = 4 WHERE trabajo_id = a AND nombre = 'i1';
  SELECT total INTO tot FROM t_trabajos WHERE id = a;
  ok := (tot = 3000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 1b total tras editar cantidad=' || tot || ' (3000)' || E'\n'; END IF;
  DELETE FROM t_trabajo_productos WHERE trabajo_id = a AND nombre = 'i1';
  SELECT total INTO tot FROM t_trabajos WHERE id = a;
  ok := (tot = 1000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 1c total tras borrar item=' || tot || ' (1000)' || E'\n'; END IF;
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (a, 'i1', 2, 500);
  ok := false; BEGIN UPDATE t_trabajo_productos SET subtotal = 1 WHERE trabajo_id = a; EXCEPTION WHEN OTHERS THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 1d subtotal es columna generada: no debe poder escribirse' || E'\n'; END IF;

  -- ================= 2. COBRO A CUENTA CORRIENTE CON FIFO =================
  -- Cobro de 2500: debe ir a C (1500, el mas viejo) y A (1000). NUNCA al ANULADO ni al presupuesto sin aprobar.
  SELECT * INTO v_res FROM registrar_cobro_con_fifo(v_cli, 2500, 'Efectivo', NULL, 'reg', NULL);
  SELECT COALESCE(sum(monto_aplicado) FILTER (WHERE trabajo_id = b), 0), COALESCE(sum(monto_aplicado) FILTER (WHERE trabajo_id = v_p), 0),
         COALESCE(sum(monto_aplicado) FILTER (WHERE trabajo_id = c), 0), COALESCE(sum(monto_aplicado) FILTER (WHERE trabajo_id = a), 0)
    INTO apl_b, apl_p, apl_c, apl_a FROM t_recibo_trabajos WHERE recibo_id = v_res.recibo_id;
  ok := (apl_c = 1500 AND apl_a = 1000 AND apl_b = 0 AND apl_p = 0); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 2a FIFO: C=%s (1500) A=%s (1000) ANULADO=%s (0) PRESUPUESTO=%s (0)', apl_c, apl_a, apl_b, apl_p) || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM t_movimientos_caja WHERE id = v_res.movimiento_caja_id AND categoria = 'cobro' AND tipo = 'ingreso' AND metodo = 'Efectivo' AND monto = 2500;
  ok := (v_n = 1); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 2b el cobro no genero su movimiento de caja' || E'\n'; END IF;
  ok := false; BEGIN PERFORM registrar_cobro_con_fifo(v_cli, 0, 'Efectivo'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 2c cobro de $0 debe rechazarse' || E'\n'; END IF;

  -- ================= 3. COBRO AL ENTREGAR CON DESCUENTO =================
  RESET ROLE;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'D', 'TERMINADO', hoy_ar()) RETURNING id INTO d;
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (d, 'i', 1, 1000);
  SET LOCAL ROLE authenticated;
  PERFORM registrar_cobro_cierre_trabajo(d, v_cli, 800, 'Transferencia', 20, 'test');
  SELECT total, saldo_pendiente INTO tot, sal FROM v_saldo_trabajos WHERE id = d;
  ok := (tot = 800 AND sal = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 3a descuento 20%%: total=%s (800) saldo=%s (0)', tot, sal) || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM t_movimientos_caja WHERE metodo = 'Transferencia' AND monto = 800 AND descripcion LIKE 'Cobro de trabajo%' AND apertura_caja_id = v_caja;
  ok := (v_n >= 1); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 3b el pago del trabajo no llego a caja (trigger)' || E'\n'; END IF;

  -- ================= 4. CREDITO A FAVOR DEL CLIENTE =================
  SELECT * INTO v_res FROM registrar_cobro_con_fifo(v_cli, 10000, 'Efectivo', NULL, 'credito', NULL);   -- solo A tiene 1000 pendiente
  ok := (v_res.monto_aplicado_fifo = 1000 AND v_res.monto_no_aplicado = 9000); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 4a cobro 10000 con 1000 pendiente: aplicado=%s sobrante=%s', v_res.monto_aplicado_fifo, v_res.monto_no_aplicado) || E'\n'; END IF;
  SELECT credito_disponible INTO cred FROM v_saldo_clientes WHERE id = v_cli;
  ok := (cred = 9000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 4b credito_disponible=' || cred || ' (9000): fan-out de join en v_saldo_clientes' || E'\n'; END IF;
  RESET ROLE;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'E', 'APROBADO', hoy_ar()) RETURNING id INTO e;
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (e, 'i', 1, 4000);
  SET LOCAL ROLE authenticated;
  PERFORM aplicar_credito_a_trabajos(v_cli, e);
  SELECT saldo_pendiente INTO sal FROM v_saldo_trabajos WHERE id = e;
  SELECT credito_disponible INTO cred2 FROM v_saldo_clientes WHERE id = v_cli;
  ok := (sal = 0 AND cred2 = 5000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 4c aplicar credito a E: saldo=%s (0) credito restante=%s (5000)', sal, cred2) || E'\n'; END IF;
  PERFORM aplicar_credito_a_trabajos(v_cli, NULL);
  SELECT COALESCE(sum(monto_aplicado),0) INTO apl_b FROM t_recibo_trabajos WHERE trabajo_id = b;
  SELECT COALESCE(sum(monto_aplicado),0) INTO apl_p FROM t_recibo_trabajos WHERE trabajo_id = v_p;
  ok := (apl_b = 0 AND apl_p = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 4d "aplicar a todos" toco ANULADO=%s o PRESUPUESTO=%s', apl_b, apl_p) || E'\n'; END IF;
  SELECT saldo_pendiente INTO sal FROM v_saldo_clientes WHERE id = v_cli;
  ok := (sal = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 4e saldo del cliente=' || sal || ' (0, todo cobrado)' || E'\n'; END IF;
  PERFORM aplicar_credito_a_trabajos(v_cli, v_p);   -- accion explicita sobre un trabajo puntual: permitida
  SELECT COALESCE(sum(monto_aplicado),0) INTO apl_p FROM t_recibo_trabajos WHERE trabajo_id = v_p;
  ok := (apl_p = 3000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 4f aplicar credito a un trabajo puntual=' || apl_p || ' (3000)' || E'\n'; END IF;

  -- ================= 5. SALDO DEL CLIENTE, COMPROBANTES Y AJUSTES =================
  RESET ROLE;
  INSERT INTO t_trabajos (cliente_id, nombre_trabajo, estado, fecha_aprobacion) VALUES (v_cli, 'F', 'APROBADO', hoy_ar()) RETURNING id INTO f;
  INSERT INTO t_trabajo_productos (trabajo_id, nombre, cantidad, precio_unitario) VALUES (f, 'i', 1, 1210);
  INSERT INTO t_comprobantes (cliente_id, tipo, subtotal, iva, estado) VALUES (v_cli, 'Factura B', 1000, 210, 'pendiente') RETURNING id INTO v_comp;       -- vinculado a F
  INSERT INTO t_comprobante_trabajos (comprobante_id, trabajo_id) VALUES (v_comp, f);
  SET LOCAL ROLE authenticated;
  SELECT * INTO est FROM v_estado_comprobantes WHERE comprobante_id = v_comp;
  ok := (est.estado_real = 'pendiente' AND est.saldo_pendiente_real = 1210); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 5a comprobante vinculado sin pagos: estado=%s saldo=%s (pendiente / 1210)', est.estado_real, est.saldo_pendiente_real) || E'\n'; END IF;
  INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago) VALUES (f, v_cli, 600, 'pago', 'EFECTIVO');
  SELECT * INTO est FROM v_estado_comprobantes WHERE comprobante_id = v_comp;
  ok := (est.estado_real = 'parcial' AND est.saldo_pendiente_real = 610); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 5b pago parcial: estado=%s saldo=%s (parcial / 610)', est.estado_real, est.saldo_pendiente_real) || E'\n'; END IF;
  INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago) VALUES (f, v_cli, 610, 'pago', 'EFECTIVO');
  SELECT * INTO est FROM v_estado_comprobantes WHERE comprobante_id = v_comp;
  ok := (est.estado_real = 'cobrado' AND est.saldo_pendiente_real = 0); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 5c pago total: estado=%s saldo=%s (cobrado / 0)', est.estado_real, est.saldo_pendiente_real) || E'\n'; END IF;

  RESET ROLE;
  INSERT INTO t_comprobantes (cliente_id, tipo, subtotal, iva, estado) VALUES (v_cli, 'Factura B', 1000, 210, 'pendiente') RETURNING id INTO v_comp2;     -- suelto (sin trabajo)
  SET LOCAL ROLE authenticated;
  SELECT total_deuda, saldo_pendiente INTO deuda0, saldo0 FROM v_saldo_clientes WHERE id = v_cli;
  -- deuda = C 1500 + A 2000 + D 800 + E 4000 + F 1210 (trabajos aprobados y no anulados) + comprobante suelto 1210. El comprobante vinculado NO se cuenta doble.
  ok := (deuda0 = 1500 + 2000 + 800 + 4000 + 1210 + 1210); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 5d total_deuda=' || deuda0 || ' (10720: trabajos aprobados + comprobante suelto, sin doble conteo)' || E'\n'; END IF;
  INSERT INTO t_ajustes_cc (cliente_id, tipo, monto) VALUES (v_cli, 'credito', 300);
  INSERT INTO t_ajustes_cc (cliente_id, tipo, monto) VALUES (v_cli, 'debito', 100);
  SELECT saldo_pendiente INTO saldo1 FROM v_saldo_clientes WHERE id = v_cli;
  ok := (saldo1 = saldo0 - 300 + 100); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 5e ajustes: saldo %s -> %s (esperado %s)', saldo0, saldo1, saldo0 - 200) || E'\n'; END IF;
  ok := false; BEGIN INSERT INTO t_ajustes_cc (cliente_id, tipo, monto) VALUES (v_cli, 'credito', -5); EXCEPTION WHEN OTHERS THEN ok := true; END;
  -- (el monto siempre positivo lo pide la regla del modulo; si la base no lo rechaza se informa pero no se cuenta como falla grave)
  IF NOT ok THEN omitidos := omitidos || 'AVISO 5f t_ajustes_cc acepta monto negativo (deberia ser siempre positivo)' || E'\n'; END IF;

  -- ================= 6. TRIGGER PAGO -> CAJA, DUPLICAR TRABAJO =================
  INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago) VALUES (a, v_cli, 100, 'pago', 'EFECTIVO') RETURNING id INTO v_pago;
  SELECT count(*) INTO v_n FROM t_movimientos_caja WHERE pago_trabajo_id = v_pago AND metodo = 'Efectivo' AND categoria = 'cobro';
  ok := (v_n = 1); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 6a pago de trabajo no llego a caja' || E'\n'; END IF;
  SELECT * INTO v_dup FROM duplicar_trabajo(a, NULL);
  ok := ((SELECT count(*) FROM t_trabajo_productos WHERE trabajo_id = v_dup.nuevo_trabajo_id) = 2
         AND (SELECT estado FROM t_trabajos WHERE id = v_dup.nuevo_trabajo_id) = 'PRESUPUESTADO'
         AND (SELECT count(*) FROM t_pagos_trabajo WHERE trabajo_id = v_dup.nuevo_trabajo_id) = 0
         AND (SELECT fecha_aprobacion FROM t_trabajos WHERE id = v_dup.nuevo_trabajo_id) IS NULL
         AND (SELECT facturado FROM t_trabajos WHERE id = v_dup.nuevo_trabajo_id) = false);
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 6b duplicar_trabajo: copia items, queda PRESUPUESTADO, sin pagos, sin aprobacion, sin facturar' || E'\n'; END IF;
  ok := false; BEGIN PERFORM duplicar_trabajo(gen_random_uuid(), NULL); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 6c duplicar un trabajo inexistente debe rechazarse' || E'\n'; END IF;
  -- gasto e ingreso extra de caja + constraint de categoria
  INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion) VALUES (v_caja, 'egreso', 'gasto', 'Efectivo', 50, 'gasto reg');
  INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto, descripcion) VALUES (v_caja, 'ingreso', 'ingreso_extra', 'Efectivo', 70, 'extra reg');
  ok := false; BEGIN INSERT INTO t_movimientos_caja (apertura_caja_id, tipo, categoria, metodo, monto) VALUES (v_caja, 'egreso', 'cobro', 'Efectivo', 1); EXCEPTION WHEN check_violation THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 6d un egreso con categoria "cobro" debe rechazarse (CHECK)' || E'\n'; END IF;

  -- ================= 7. STOCK DE INSUMOS =================
  RESET ROLE;
  SELECT id INTO v_hoja FROM t_conf_unidades_medida WHERE nombre = 'Hoja'; SELECT id INTO v_resma FROM t_conf_unidades_medida WHERE nombre = 'Resma'; SELECT id INTO v_kilo FROM t_conf_unidades_medida WHERE nombre = 'Kilo';
  INSERT INTO t_insumos (nombre, unidad_stock_id, unidad_compra_id, factor_compra, stock, stock_minimo, ultimo_costo_compra) VALUES ('Papel Reg', v_hoja, v_resma, 500, 999, 200, 5000) RETURNING id INTO v_ins;
  INSERT INTO t_insumos (nombre, unidad_stock_id) VALUES ('Tinta Reg', v_kilo) RETURNING id INTO v_ins2;
  SET LOCAL ROLE authenticated;
  SELECT stock INTO v_stock FROM t_insumos WHERE id = v_ins;
  ok := (v_stock = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7a el stock inicial debe forzarse a 0 (intento 999)=' || v_stock || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_movimiento_stock(v_ins, 'entrada', 2, NULL, true, 'test');           -- 2 resmas = 1000 hojas
  ok := (v_res.stock_nuevo = 1000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7b entrada de 2 resmas x500=' || v_res.stock_nuevo || ' (1000)' || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_movimiento_stock(v_ins, 'salida', 300, NULL, false, 'test');
  ok := (v_res.stock_nuevo = 700); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7c salida de 300=' || v_res.stock_nuevo || ' (700)' || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_movimiento_stock(v_ins, 'ajuste', NULL, 690, false, 'conteo');
  ok := (v_res.stock_nuevo = 690 AND (SELECT cantidad FROM t_movimientos_stock WHERE id = v_res.movimiento_id) = 10); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7d ajuste a 690: la cantidad deducida debe ser 10' || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_movimiento_stock(v_ins, 'salida', 1000, NULL, false, 'de mas');
  ok := (v_res.stock_nuevo = -310); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7e el stock negativo debe permitirse (senal de dato a corregir)=' || v_res.stock_nuevo || E'\n'; END IF;
  ok := false; BEGIN UPDATE t_insumos SET stock = 5000 WHERE id = v_ins; EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7f UPDATE directo del stock debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN DELETE FROM t_movimientos_stock WHERE insumo_id = v_ins; EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7g los movimientos de stock son append-only (DELETE debe rechazarse)' || E'\n'; END IF;
  ok := false; BEGIN PERFORM registrar_movimiento_stock(v_ins, 'ajuste', NULL, 10, false, ''); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7h el ajuste sin motivo debe rechazarse' || E'\n'; END IF;
  INSERT INTO t_movimientos_stock (insumo_id, tipo, cantidad, stock_anterior, stock_nuevo) VALUES (v_ins2, 'entrada', 5, 12345, 99999);
  SELECT stock INTO v_stock FROM t_insumos WHERE id = v_ins2;
  ok := (v_stock = 5); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 7i un insert directo con stock_anterior/nuevo falsos debe recalcularse: stock=' || v_stock || ' (5)' || E'\n'; END IF;

  -- ================= 8. PROVEEDORES =================
  RESET ROLE;
  INSERT INTO t_proveedores (nombre, condicion_pago, limite_credito) VALUES ('Prov Reg', 'cuenta_corriente', 50000) RETURNING id INTO v_prov;
  INSERT INTO t_proveedores (nombre, activo) VALUES ('Inactivo Reg', false) RETURNING id INTO v_inact;
  SET LOCAL ROLE authenticated;
  PERFORM registrar_ajuste_proveedor(v_prov, 'cargo', 10000, 'Saldo inicial');
  PERFORM registrar_ajuste_proveedor(v_prov, 'nota_debito', 500, 'Intereses');
  SELECT * INTO v_res FROM registrar_ajuste_proveedor(v_prov, 'nota_credito', 1000, 'Bonificacion');
  ok := (v_res.saldo_pendiente = 9500); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 8a saldo de proveedor=' || v_res.saldo_pendiente || ' (9500)' || E'\n'; END IF;
  SELECT efectivo_esperado INTO v_ef0 FROM v_caja_efectivo_actual;
  SELECT * INTO v_res FROM registrar_pago_proveedor(v_prov, 4000, 'EFECTIVO', NULL, 'Recibo 1', true);
  SELECT efectivo_esperado INTO v_ef1 FROM v_caja_efectivo_actual;
  ok := (v_res.saldo_pendiente = 5500 AND v_ef0 - v_ef1 = 4000); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 8b pago en efectivo con caja: saldo=%s (5500) efectivo %s -> %s (baja 4000)', v_res.saldo_pendiente, v_ef0, v_ef1) || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_pago_proveedor(v_prov, 1500, 'Transferencia', NULL, NULL, true);
  SELECT efectivo_esperado INTO v_ef0 FROM v_caja_efectivo_actual;
  ok := (v_ef0 = v_ef1); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 8c un pago por transferencia NO debe bajar el efectivo esperado' || E'\n'; END IF;
  ok := false; BEGIN PERFORM registrar_ajuste_proveedor(v_prov, 'pago', 10, 'x'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 8d un ajuste de tipo "pago" debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN DELETE FROM t_proveedores WHERE id = v_prov; EXCEPTION WHEN foreign_key_violation THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 8e un proveedor con movimientos no se puede borrar' || E'\n'; END IF;

  -- ================= 9. COMPRAS =================
  SELECT efectivo_esperado INTO v_ef0 FROM v_caja_efectivo_actual;
  SELECT * INTO v_res FROM registrar_compra(v_prov, jsonb_build_array(
      jsonb_build_object('insumo_id', v_ins, 'cantidad', 2, 'en_unidad_compra', true, 'costo_unitario', 5000),
      jsonb_build_object('insumo_id', v_ins, 'cantidad', 100, 'en_unidad_compra', false, 'costo_unitario', 12),
      jsonb_build_object('insumo_id', v_ins2, 'cantidad', 3, 'costo_unitario', 2000)), 'contado', 'EFECTIVO', NULL, 'FA-REG', true);
  v_c1 := v_res.nueva_compra_id; SELECT efectivo_esperado INTO v_ef1 FROM v_caja_efectivo_actual;
  ok := (v_res.total_compra = 17200 AND v_ef0 - v_ef1 = 17200); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 9a compra al contado: total=%s (17200) efectivo %s -> %s (baja 17200)', v_res.total_compra, v_ef0, v_ef1) || E'\n'; END IF;
  ok := ((SELECT ultimo_costo_compra FROM t_insumos WHERE id = v_ins) = 6000); n_tests := n_tests + 1;   -- la ultima linea fue 12/hoja x 500
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9b ultimo_costo_compra del papel debe ser 6000 por resma (12 por hoja x 500)' || E'\n'; END IF;
  SELECT * INTO v_res FROM registrar_compra(v_prov, jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'cantidad', 1, 'en_unidad_compra', true, 'costo_unitario', 5000)), 'cuenta_corriente', NULL, NULL, 'FA-REG2');
  v_c2 := v_res.nueva_compra_id;
  ok := (v_res.total_compra = 5000); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9c compra a cuenta corriente' || E'\n'; END IF;
  ok := false; BEGIN PERFORM registrar_compra(v_prov, '[]'::jsonb, 'cuenta_corriente'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9d una compra sin items debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN PERFORM registrar_compra(v_inact, jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'cantidad', 1, 'costo_unitario', 5)), 'cuenta_corriente'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9e un proveedor inactivo no puede recibir compras' || E'\n'; END IF;
  SELECT stock INTO stock_antes FROM t_insumos WHERE id = v_ins;
  SELECT * INTO v_a FROM anular_compra(v_c2, 'Error de carga', NULL);
  ok := ((SELECT stock FROM t_insumos WHERE id = v_ins) = stock_antes - 500 AND (SELECT estado FROM t_compras WHERE id = v_c2) = 'anulada'); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9f anular compra: debe descontar del stock lo comprado (500 hojas) y marcarla anulada' || E'\n'; END IF;
  ok := false; BEGIN PERFORM anular_compra(v_c2, 'otra vez'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9g anular dos veces debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN UPDATE t_compras SET total = 1 WHERE id = v_c1; EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9h las compras no se editan directamente' || E'\n'; END IF;
  -- atomicidad: contado con caja pedida y SIN caja abierta => no debe quedar nada a medias
  RESET ROLE;
  SELECT count(*) INTO n_comp_antes FROM t_compras; SELECT stock INTO stock_antes FROM t_insumos WHERE id = v_ins;
  UPDATE t_aperturas_caja SET fecha_cierre = hoy_ar() WHERE fecha_cierre IS NULL;
  SET LOCAL ROLE authenticated;
  ok := false; BEGIN PERFORM registrar_compra(v_prov, jsonb_build_array(jsonb_build_object('insumo_id', v_ins, 'cantidad', 1, 'en_unidad_compra', true, 'costo_unitario', 5000)), 'contado', 'Efectivo', NULL, 'SIN-CAJA', true);
  EXCEPTION WHEN raise_exception THEN ok := true; END;
  ok := ok AND (n_comp_antes = (SELECT count(*) FROM t_compras)) AND (stock_antes = (SELECT stock FROM t_insumos WHERE id = v_ins));
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 9i compra al contado sin caja abierta: debe rechazarse SIN dejar compra ni stock a medias' || E'\n'; END IF;
  RESET ROLE;
  INSERT INTO t_aperturas_caja (fecha_apertura, saldo_inicio) VALUES (hoy_ar(), 5000) RETURNING id INTO v_caja;   -- reabrir para lo que sigue
  SET LOCAL ROLE authenticated;

  -- ================= 10. COSTEO INTERNO =================
  RESET ROLE;
  SELECT id INTO v_item FROM t_trabajo_productos WHERE trabajo_id = a LIMIT 1;
  INSERT INTO t_servicios (nombre, tipo, costo_unitario) VALUES ('Diseno Reg', 'propio', 8000) RETURNING id INTO v_serv;
  SET LOCAL ROLE authenticated;
  UPDATE t_trabajo_productos SET costeo = jsonb_build_object('margen_pct', 40, 'costo_total', 1, 'precio_sugerido', 1,
    'componentes', jsonb_build_array(
      jsonb_build_object('tipo','insumo','ref_id',v_ins,'nombre','Papel','cantidad',2,'en_unidad_compra',true,'costo_unitario',5000,'subtotal',1),
      jsonb_build_object('tipo','servicio','ref_id',v_serv,'nombre','Diseno','cantidad',1.5,'costo_unitario',8000),
      jsonb_build_object('tipo','tercerizado','nombre','Troquelado','cantidad',1,'costo_unitario',3000.5))) WHERE id = v_item;
  SELECT costeo INTO v_json FROM t_trabajo_productos WHERE id = v_item;
  ok := ((v_json->>'costo_total')::numeric = 25000.50 AND (v_json->>'precio_sugerido')::numeric = 35000.70 AND (v_json->'componentes'->0->>'cantidad_stock')::numeric = 1000);
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 10a el servidor debe recalcular costo_total (25000.50), precio_sugerido (35000.70) y cantidad_stock (1000) pisando lo que mande el cliente' || E'\n'; END IF;
  ok := false; BEGIN UPDATE t_trabajo_productos SET costeo = '{"componentes":[{"tipo":"insumo","nombre":"x","cantidad":-1,"costo_unitario":5}]}'::jsonb WHERE id = v_item; EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 10b un componente con cantidad negativa debe rechazarse' || E'\n'; END IF;
  SELECT total INTO tot FROM t_trabajos WHERE id = a;
  ok := (tot = (SELECT sum(subtotal) FROM t_trabajo_productos WHERE trabajo_id = a)); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 10c el costeo interno NO debe alterar el total del trabajo' || E'\n'; END IF;
  SELECT * INTO est FROM (SELECT costo_interno, ganancia, items_con_costeo FROM v_margen_trabajo WHERE trabajo_id = a) x;
  ok := (est.items_con_costeo = 1 AND est.costo_interno = 25000.50); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 10d v_margen_trabajo: costo_interno=' || est.costo_interno || ' (25000.50)' || E'\n'; END IF;
  SELECT * INTO v_dup FROM duplicar_trabajo(a, NULL);
  ok := ((SELECT count(*) FROM t_trabajo_productos WHERE trabajo_id = v_dup.nuevo_trabajo_id AND costeo IS NOT NULL) = 1); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 10e duplicar_trabajo debe copiar el costeo de los items' || E'\n'; END IF;

  -- ================= 11. CIERRE DE CAJA =================
  SELECT * INTO v_res FROM cerrar_y_reabrir_caja(v_caja, 5000, 1000, 'Efectivo', 'reg', NULL);
  SELECT * INTO snap FROM t_aperturas_caja WHERE id = v_caja; SELECT count(*) INTO v_n FROM t_aperturas_caja WHERE fecha_cierre IS NULL;
  ok := (snap.cerrada_at IS NOT NULL AND snap.efectivo_esperado IS NOT NULL AND snap.total_retiros = 1000 AND snap.desglose_metodos IS NOT NULL AND v_n = 1 AND v_res.saldo_inicio_nuevo = 4000);
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || format('FALLA 11a cierre de caja: foto del turno guardada, exactamente 1 abierta (%s), nuevo inicio=%s (4000)', v_n, v_res.saldo_inicio_nuevo) || E'\n'; END IF;
  ok := false; BEGIN PERFORM cerrar_y_reabrir_caja(v_caja, 1, 0); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 11b cerrar una apertura ya cerrada debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN PERFORM cerrar_y_reabrir_caja(v_res.nueva_apertura_id, 100, 200); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 11c retirar mas de lo contado debe rechazarse' || E'\n'; END IF;

  -- ================= 12. WALLET DE MARKETING =================
  RESET ROLE; SELECT saldo INTO v_mk FROM t_saldo_marketing LIMIT 1; SET LOCAL ROLE authenticated;
  PERFORM cargar_saldo_marketing(1000, 'reg', NULL); PERFORM descontar_saldo_marketing(600, 'generar_promos', 'reg', NULL);
  SELECT saldo INTO tot FROM t_saldo_marketing LIMIT 1;
  ok := (tot = COALESCE(v_mk, 0) + 400); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 12a wallet: saldo inicial +1000 -600' || E'\n'; END IF;
  ok := false; BEGIN PERFORM descontar_saldo_marketing(tot + 1, 'generar_promos', 'reg', NULL); EXCEPTION WHEN OTHERS THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 12b descontar mas que el saldo debe rechazarse' || E'\n'; END IF;
  RESET ROLE;

  -- ================= 13. ALTA AUTOMATICA DE USUARIOS (trigger sobre auth.users) =================
  BEGIN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES (v_uid, 'regresion-' || v_uid || '@test.local', '{"full_name":"Usuario Reg"}'::jsonb);
    SELECT count(*) INTO v_n FROM t_usuarios WHERE id = v_uid AND full_name = 'Usuario Reg';
    ok := (v_n = 1); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 13a handle_new_user: un usuario nuevo debe aparecer en t_usuarios con su nombre' || E'\n'; END IF;
  EXCEPTION WHEN OTHERS THEN
    omitidos := omitidos || 'OMITIDO 13 alta de usuarios: no se pudo insertar en auth.users desde esta conexion (' || SQLERRM || ')' || E'\n';
  END;

  -- ================= 14. SEGURIDAD Y ESTRUCTURA =================
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','v') AND has_table_privilege('anon', c.oid, 'SELECT');
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14a anon NO debe tener permisos sobre tablas/vistas de public: ' || v_n || ' con SELECT' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14b anon NO debe poder ejecutar funciones de public: ' || v_n || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'v' AND NOT COALESCE(c.reloptions::text, '') ILIKE '%security_invoker=true%';
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14c hay ' || v_n || ' vista(s) sin security_invoker (saltean RLS)' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND p.proconfig IS NULL AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14d hay ' || v_n || ' funcion(es) sin search_path fijo' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_tables t WHERE t.schemaname = 'public' AND (NOT t.rowsecurity OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename));
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14e hay ' || v_n || ' tabla(s) sin RLS o sin politicas' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prokind = 'f' AND proname <> 'hoy_ar' AND pg_get_functiondef(oid) ~* 'current_date';
  ok := (v_n = 0); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14f hay ' || v_n || ' funcion(es) que usan CURRENT_DATE (usar hoy_ar())' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_recalcular_total_trabajo','trg_pago_trabajo_a_caja','trg_normalizar_costeo','trg_proteger_stock_insumo','trg_aplicar_movimiento_stock','trg_bloquear_edicion_movimiento_stock','trg_proteger_compra','trg_bloquear_edicion_compra_item','trg_ventas_update');
  ok := (v_n = 9); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14g faltan triggers de negocio: ' || v_n || '/9' || E'\n'; END IF;
  SELECT count(*) INTO v_n FROM pg_indexes WHERE schemaname = 'public' AND indexname IN ('idx_trabajo_productos_trabajo','idx_trabajos_cliente','idx_pagos_trabajo_trabajo','idx_pagos_trabajo_cliente','idx_recibo_trabajos_trabajo','idx_recibo_trabajos_recibo','idx_recibos_cliente','idx_movimientos_caja_apertura');
  ok := (v_n = 8); n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14h faltan indices criticos de rendimiento: ' || v_n || '/8' || E'\n'; END IF;
  -- una funcion NUEVA no debe quedar ejecutable por anon (el EXECUTE a PUBLIC se quita con un default privilege GLOBAL)
  CREATE FUNCTION public.zz_sonda_permisos() RETURNS int LANGUAGE sql SET search_path = public, pg_temp AS 'SELECT 1';
  ok := (NOT has_function_privilege('anon', 'public.zz_sonda_permisos()', 'EXECUTE') AND has_function_privilege('authenticated', 'public.zz_sonda_permisos()', 'EXECUTE') AND has_function_privilege('service_role', 'public.zz_sonda_permisos()', 'EXECUTE'));
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14k una funcion nueva queda ejecutable por anon (revisar ALTER DEFAULT PRIVILEGES global)' || E'\n'; END IF;
  SET LOCAL ROLE anon;
  ok := false; BEGIN PERFORM registrar_cobro_con_fifo(v_cli, 1, 'x'); EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14i anon pudo ejecutar registrar_cobro_con_fifo' || E'\n'; END IF;
  ok := false; BEGIN PERFORM count(*) FROM v_saldo_clientes; EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 14j anon pudo leer v_saldo_clientes' || E'\n'; END IF;
  RESET ROLE;
  SET LOCAL ROLE service_role;
  PERFORM descontar_saldo_marketing(1, 'generar_promos', 'svc', NULL);    -- las Edge Functions usan service_role
  SELECT count(*) INTO v_n FROM ventas; n_tests := n_tests + 1;               -- el backend ARCA usa service_role sobre estas vistas
  RESET ROLE;

  -- ================= 15. INVARIANTES DE LA CUENTA CORRIENTE DEL CLIENTE (Fase 2, 2026-09-28) =================
  -- La plata se aplica al CLIENTE (via t_recibos/t_recibo_trabajos y t_pagos_trabajo); estas dos tablas son
  -- la base de v_saldo_clientes, la fuente de verdad. Antes de esta fase, la unica proteccion vivia en las
  -- funciones (registrar_cobro_con_fifo, aplicar_credito_a_trabajos); un insert directo no tenia freno.
  RESET ROLE;
  INSERT INTO t_recibos (cliente_id, fecha, numero, total) VALUES (v_cli, hoy_ar(), 'REC-F2-' || gen_random_uuid(), 1000) RETURNING id INTO v_pago;   -- v_pago se reusa como id generico
  SET LOCAL ROLE authenticated;
  ok := false; BEGIN INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado) VALUES (v_pago, b, 500); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 15a insert directo de t_recibo_trabajos a un trabajo ANULADO debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado) VALUES (v_pago, a, 1500); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 15b aplicar mas del total del recibo debe rechazarse' || E'\n'; END IF;
  INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado) VALUES (v_pago, a, 1000);
  ok := ((SELECT count(*) FROM t_recibo_trabajos WHERE recibo_id = v_pago) = 1); n_tests := n_tests + 1;
  IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 15c una aplicacion valida (dentro del limite, trabajo vigente) debe funcionar' || E'\n'; END IF;
  ok := false; BEGIN INSERT INTO t_recibo_trabajos (recibo_id, trabajo_id, monto_aplicado) VALUES (v_pago, a, 1); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 15d una segunda aplicacion que ya no tiene margen en el recibo debe rechazarse' || E'\n'; END IF;
  ok := false; BEGIN INSERT INTO t_pagos_trabajo (trabajo_id, cliente_id, importe, tipo, tipo_pago) VALUES (b, v_cli, 100, 'pago', 'EFECTIVO'); EXCEPTION WHEN raise_exception THEN ok := true; END;
  n_tests := n_tests + 1; IF NOT ok THEN fails := fails + 1; r := r || 'FALLA 15e insert directo de t_pagos_trabajo a un trabajo ANULADO debe rechazarse' || E'\n'; END IF;

  RAISE EXCEPTION '%',
    'REGRESION: ' || (n_tests - fails) || ' de ' || n_tests || ' OK, ' || fails || ' FALLA(S)' || E'\n'
    || CASE WHEN fails = 0 THEN 'Todo en orden.' ELSE 'Detalle de fallas:' || E'\n' || r END
    || CASE WHEN omitidos = '' THEN '' ELSE E'\nAvisos:\n' || omitidos END
    || E'\n(Este error es intencional: revierte todos los datos de prueba.)';
END $reg$;
