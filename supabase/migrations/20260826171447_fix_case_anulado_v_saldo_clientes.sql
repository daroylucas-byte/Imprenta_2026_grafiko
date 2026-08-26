-- Bug: la vista comparaba t_trabajos.estado contra 'cancelado'/'anulado' en minúscula,
-- pero la app usa 'CANCELADO'/'ANULADO' en mayúscula. Como Postgres compara texto exacto,
-- el filtro nunca excluía nada: los trabajos anulados seguían contando como deuda del
-- cliente en la cuenta corriente. Mismo cuerpo de la vista, solo se corrige el ARRAY.
CREATE OR REPLACE VIEW v_saldo_clientes AS
 WITH deuda_trabajos AS (
         SELECT t.cliente_id,
            COALESCE(sum(t.total), 0::numeric) AS total
           FROM t_trabajos t
          WHERE t.fecha_aprobacion IS NOT NULL AND (t.estado <> ALL (ARRAY['CANCELADO'::text, 'ANULADO'::text]))
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
