-- Permite inactivar clientes en vez de borrarlos (soft-delete). Un cliente
-- inactivo conserva todo su historial (trabajos, cuenta corriente, comprobantes)
-- intacto; solo deja de estar disponible para elegir en trabajos nuevos.
ALTER TABLE t_clientes ADD COLUMN activo BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN t_clientes.activo IS 'Si es false, el cliente está inactivado (soft-delete): no aparece como opción al crear trabajos nuevos, pero conserva todo su historial y sigue visible en la cuenta corriente.';
