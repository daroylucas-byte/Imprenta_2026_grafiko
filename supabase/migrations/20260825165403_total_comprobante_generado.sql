-- t_comprobantes.total pasa a ser columna generada (subtotal + iva). Requiere recrear
-- las vistas que dependen de la columna (v_saldo_clientes, v_estado_comprobantes) porque
-- Postgres no permite DROP COLUMN si hay vistas dependientes.
DROP VIEW IF EXISTS v_estado_comprobantes;
DROP VIEW IF EXISTS v_saldo_clientes;

ALTER TABLE t_comprobantes DROP COLUMN total;
ALTER TABLE t_comprobantes ADD COLUMN total numeric GENERATED ALWAYS AS (COALESCE(subtotal, 0) + COALESCE(iva, 0)) STORED;

CREATE VIEW v_saldo_clientes AS
 WITH deuda_trabajos AS (
         SELECT t.cliente_id,
            COALESCE(sum(t.total), 0::numeric) AS total
           FROM t_trabajos t
          WHERE t.fecha_aprobacion IS NOT NULL AND (t.estado <> ALL (ARRAY['cancelado'::text, 'anulado'::text]))
          GROUP BY t.cliente_id
        ), deuda_comprobantes AS (
         SELECT v.cliente_id,
            COALESCE(sum(v.total), 0::numeric) AS total
           FROM t_comprobantes v
          WHERE v.estado <> 'anulado'::t_estado_comprobante AND NOT (EXISTS ( SELECT 1
                   FROM t_comprobante_trabajos ct
                  WHERE ct.comprobante_id = v.id))
          GROUP BY v.cliente_id
        ), pagos_directos AS (
         SELECT t_pagos_trabajo.cliente_id,
            COALESCE(sum(t_pagos_trabajo.importe), 0::numeric) AS total
           FROM t_pagos_trabajo
          GROUP BY t_pagos_trabajo.cliente_id
        ), recibos_cliente AS (
         SELECT r.cliente_id,
            COALESCE(sum(r.total), 0::numeric) AS total_recibos,
            COALESCE(sum(rt.monto_aplicado), 0::numeric) AS total_aplicado
           FROM t_recibos r
             LEFT JOIN t_recibo_trabajos rt ON rt.recibo_id = r.id
          GROUP BY r.cliente_id
        ), ajustes_cliente AS (
         SELECT a.cliente_id,
            COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'credito'::t_tipo_ajuste_cc), 0::numeric) AS total_credito,
            COALESCE(sum(a.monto) FILTER (WHERE a.tipo = 'debito'::t_tipo_ajuste_cc), 0::numeric) AS total_debito
           FROM t_ajustes_cc a
          GROUP BY a.cliente_id
        )
 SELECT c.id,
    c.nombre,
    c.razon_social,
    c.cuit,
    c.email,
    c.telefonos,
    c.created_at,
    COALESCE(dt.total, 0::numeric) + COALESCE(dc.total, 0::numeric) AS total_deuda,
    COALESCE(pd.total, 0::numeric) + COALESCE(rc.total_aplicado, 0::numeric) AS total_cobrado,
    COALESCE(ac.total_credito, 0::numeric) AS total_ajustes_credito,
    COALESCE(ac.total_debito, 0::numeric) AS total_ajustes_debito,
    COALESCE(dt.total, 0::numeric) + COALESCE(dc.total, 0::numeric) - COALESCE(pd.total, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric) - COALESCE(ac.total_credito, 0::numeric) + COALESCE(ac.total_debito, 0::numeric) AS saldo_pendiente,
    COALESCE(rc.total_recibos, 0::numeric) - COALESCE(rc.total_aplicado, 0::numeric) AS credito_disponible,
    c.activo
   FROM t_clientes c
     LEFT JOIN deuda_trabajos dt ON dt.cliente_id = c.id
     LEFT JOIN deuda_comprobantes dc ON dc.cliente_id = c.id
     LEFT JOIN pagos_directos pd ON pd.cliente_id = c.id
     LEFT JOIN recibos_cliente rc ON rc.cliente_id = c.id
     LEFT JOIN ajustes_cliente ac ON ac.cliente_id = c.id;

CREATE VIEW v_estado_comprobantes AS
 WITH trabajo_vinculado AS (
         SELECT ct.comprobante_id,
            ct.trabajo_id
           FROM t_comprobante_trabajos ct
        ), cobros_directos AS (
         SELECT cc.comprobante_id,
            COALESCE(sum(cc.importe), 0::numeric) AS total_cobrado
           FROM t_comprobante_cobros cc
          GROUP BY cc.comprobante_id
        )
 SELECT c.id AS comprobante_id,
    c.estado AS estado_guardado,
    tv.trabajo_id,
        CASE
            WHEN c.estado = 'anulado'::t_estado_comprobante THEN 'anulado'::text
            WHEN tv.trabajo_id IS NOT NULL THEN
            CASE
                WHEN vst.saldo_pendiente <= 0::numeric THEN 'cobrado'::text
                WHEN vst.saldo_pendiente < c.total THEN 'parcial'::text
                ELSE 'pendiente'::text
            END
            ELSE
            CASE
                WHEN COALESCE(cd.total_cobrado, 0::numeric) >= c.total AND c.total > 0::numeric THEN 'cobrado'::text
                WHEN COALESCE(cd.total_cobrado, 0::numeric) > 0::numeric THEN 'parcial'::text
                ELSE 'pendiente'::text
            END
        END AS estado_real,
        CASE
            WHEN tv.trabajo_id IS NOT NULL THEN COALESCE(vst.total_cobrado, 0::numeric)
            ELSE COALESCE(cd.total_cobrado, 0::numeric)
        END AS total_cobrado_real,
        CASE
            WHEN tv.trabajo_id IS NOT NULL THEN COALESCE(vst.saldo_pendiente, c.total)
            ELSE c.total - COALESCE(cd.total_cobrado, 0::numeric)
        END AS saldo_pendiente_real
   FROM t_comprobantes c
     LEFT JOIN trabajo_vinculado tv ON tv.comprobante_id = c.id
     LEFT JOIN v_saldo_trabajos vst ON vst.id = tv.trabajo_id
     LEFT JOIN cobros_directos cd ON cd.comprobante_id = c.id;
