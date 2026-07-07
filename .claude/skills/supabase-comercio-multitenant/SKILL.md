---
name: supabase-comercio-multitenant
description: >
  Usar cuando se va a crear o diseñar la base de datos para una app de
  comercios o pymes con múltiples locales. Define el schema recomendado,
  las políticas RLS para cada rol (vendedor, encargado, admin_local,
  admin_empresa) y la separación entre datos compartidos y datos por local.
  También aplica cuando el usuario pregunta cómo estructurar usuarios,
  roles, locales o empresas en Supabase para este tipo de proyecto.
---

# Skill: Base de datos multi-tenant para comercios — Supabase

## El modelo de datos recomendado

Este schema resuelve tres requisitos simultáneos:
1. Un usuario puede pertenecer a múltiples empresas y múltiples locales
2. Algunos datos son compartidos entre locales (clientes, proveedores, productos)
3. Otros datos son aislados por local (ventas, stock, caja, gastos)

### Schema base — copiar como migración inicial

```sql
-- ─── EMPRESAS ────────────────────────────────────────────────────────────────
CREATE TABLE empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  cuit        text,
  activa      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- ─── LOCALES ─────────────────────────────────────────────────────────────────
CREATE TABLE locales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  direccion   text,
  activo      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_locales_empresa ON locales(id_empresa);

-- ─── MEMBRESÍAS (relación usuario ↔ empresa/local con rol) ───────────────────
-- Este es el corazón del modelo multi-tenant.
-- Un usuario puede tener múltiples membresías:
--   - rol 'admin_empresa' → id_local NULL (accede a toda la empresa)
--   - rol 'admin_local'   → id_local requerido
--   - rol 'encargado'     → id_local requerido
--   - rol 'vendedor'      → id_local requerido
CREATE TABLE membresias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id_empresa  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_local    uuid REFERENCES locales(id) ON DELETE CASCADE,
  rol         text NOT NULL CHECK (rol IN ('admin_empresa','admin_local','encargado','vendedor')),
  activa      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),

  -- Un usuario no puede tener dos membresías con el mismo rol en el mismo local
  UNIQUE (id_usuario, id_empresa, id_local, rol),

  -- admin_empresa no tiene local asignado; los demás sí
  CONSTRAINT check_local_segun_rol CHECK (
    (rol = 'admin_empresa' AND id_local IS NULL) OR
    (rol != 'admin_empresa' AND id_local IS NOT NULL)
  )
);
CREATE INDEX idx_membresias_usuario  ON membresias(id_usuario);
CREATE INDEX idx_membresias_empresa  ON membresias(id_empresa);
CREATE INDEX idx_membresias_local    ON membresias(id_local);

-- ─── DATOS COMPARTIDOS (aislados por empresa, visibles entre locales) ─────────
CREATE TABLE clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  telefono    text,
  email       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_clientes_empresa ON clientes(id_empresa);

CREATE TABLE proveedores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  cuit        text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE productos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  codigo      text,
  precio_base numeric(12,2),
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE cuenta_corriente (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_empresa   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  id_cliente   uuid REFERENCES clientes(id),
  id_proveedor uuid REFERENCES proveedores(id),
  tipo         text CHECK (tipo IN ('cliente','proveedor')),
  debe         numeric(12,2) DEFAULT 0,
  haber        numeric(12,2) DEFAULT 0,
  saldo        numeric(12,2) GENERATED ALWAYS AS (haber - debe) STORED,
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT check_solo_uno CHECK (
    (id_cliente IS NOT NULL AND id_proveedor IS NULL) OR
    (id_proveedor IS NOT NULL AND id_cliente IS NULL)
  )
);

-- ─── DATOS POR LOCAL (aislados por local) ────────────────────────────────────
CREATE TABLE ventas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_local    uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  id_empresa  uuid NOT NULL REFERENCES empresas(id), -- para el dashboard global
  id_cliente  uuid REFERENCES clientes(id),
  id_vendedor uuid NOT NULL REFERENCES auth.users(id),
  total       numeric(12,2) NOT NULL,
  estado      text DEFAULT 'completada',
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX idx_ventas_local   ON ventas(id_local);
CREATE INDEX idx_ventas_empresa ON ventas(id_empresa);

CREATE TABLE stock (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_local    uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  id_empresa  uuid NOT NULL REFERENCES empresas(id),
  id_producto uuid NOT NULL REFERENCES productos(id),
  cantidad    numeric(12,3) DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (id_local, id_producto)
);

CREATE TABLE caja (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_local    uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  id_empresa  uuid NOT NULL REFERENCES empresas(id),
  fecha       date NOT NULL DEFAULT CURRENT_DATE,
  apertura    numeric(12,2),
  cierre      numeric(12,2),
  diferencia  numeric(12,2) GENERATED ALWAYS AS (cierre - apertura) STORED,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE gastos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_local    uuid NOT NULL REFERENCES locales(id) ON DELETE CASCADE,
  id_empresa  uuid NOT NULL REFERENCES empresas(id),
  concepto    text NOT NULL,
  monto       numeric(12,2) NOT NULL,
  created_at  timestamptz DEFAULT now()
);
```

---

## Funciones helper para RLS (crear UNA VEZ, reutilizar en todas las policies)

```sql
-- ¿El usuario pertenece a esta empresa (en cualquier rol)?
CREATE OR REPLACE FUNCTION usuario_en_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias
    WHERE id_usuario = auth.uid()
      AND id_empresa = p_empresa_id
      AND activa = true
  );
$$;

-- ¿El usuario pertenece a este local?
CREATE OR REPLACE FUNCTION usuario_en_local(p_local_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias
    WHERE id_usuario = auth.uid()
      AND id_local = p_local_id
      AND activa = true
  );
$$;

-- ¿El usuario es admin_empresa de esta empresa?
CREATE OR REPLACE FUNCTION es_admin_empresa(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias
    WHERE id_usuario = auth.uid()
      AND id_empresa = p_empresa_id
      AND rol = 'admin_empresa'
      AND activa = true
  );
$$;

-- ¿El usuario es admin_local o superior en este local?
CREATE OR REPLACE FUNCTION es_admin_local(p_local_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias m
    JOIN locales l ON l.id = p_local_id
    WHERE m.id_usuario = auth.uid()
      AND m.activa = true
      AND (
        (m.id_local = p_local_id AND m.rol IN ('admin_local','encargado'))
        OR
        (m.id_empresa = l.id_empresa AND m.rol = 'admin_empresa')
      )
  );
$$;

-- ¿El usuario es vendedor de este local?
CREATE OR REPLACE FUNCTION es_vendedor_local(p_local_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM membresias
    WHERE id_usuario = auth.uid()
      AND id_local = p_local_id
      AND rol = 'vendedor'
      AND activa = true
  );
$$;
```

---

## Políticas RLS — activar y crear para cada tabla

### Tablas compartidas (aislamiento por empresa)

```sql
-- CLIENTES
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clientes_select" ON clientes FOR SELECT
  USING (usuario_en_empresa(id_empresa));

CREATE POLICY "clientes_insert" ON clientes FOR INSERT
  WITH CHECK (usuario_en_empresa(id_empresa));

CREATE POLICY "clientes_update" ON clientes FOR UPDATE
  USING (es_admin_empresa(id_empresa) OR es_admin_local(
    (SELECT id FROM locales WHERE id_empresa = clientes.id_empresa LIMIT 1)
  ));

CREATE POLICY "clientes_delete" ON clientes FOR DELETE
  USING (es_admin_empresa(id_empresa));

-- Repetir patrón para: proveedores, productos, cuenta_corriente
```

### Tablas por local (aislamiento por local + rol)

```sql
-- VENTAS
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

-- Vendedor: solo sus propias ventas
-- Encargado/admin_local: todas las ventas del local
-- Admin_empresa: todas las ventas de todos sus locales
CREATE POLICY "ventas_select" ON ventas FOR SELECT USING (
  (es_admin_empresa(id_empresa))
  OR
  (usuario_en_local(id_local) AND (
    -- admin_local y encargado ven todas
    es_admin_local(id_local)
    OR
    -- vendedor solo ve las suyas
    (es_vendedor_local(id_local) AND id_vendedor = auth.uid())
  ))
);

CREATE POLICY "ventas_insert" ON ventas FOR INSERT
  WITH CHECK (
    usuario_en_local(id_local) AND id_vendedor = auth.uid()
  );

CREATE POLICY "ventas_update" ON ventas FOR UPDATE
  USING (es_admin_local(id_local) OR es_admin_empresa(id_empresa));

CREATE POLICY "ventas_delete" ON ventas FOR DELETE
  USING (es_admin_empresa(id_empresa));

-- CAJA (solo admin_local y admin_empresa)
ALTER TABLE caja ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caja_select" ON caja FOR SELECT USING (
  es_admin_empresa(id_empresa) OR es_admin_local(id_local)
);
CREATE POLICY "caja_insert" ON caja FOR INSERT
  WITH CHECK (es_admin_local(id_local) OR es_admin_empresa(id_empresa));
CREATE POLICY "caja_update" ON caja FOR UPDATE
  USING (es_admin_local(id_local) OR es_admin_empresa(id_empresa));

-- GASTOS (solo admin_local y admin_empresa)
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_select" ON gastos FOR SELECT USING (
  es_admin_empresa(id_empresa) OR es_admin_local(id_local)
);

-- STOCK (todos ven, solo admins modifican)
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_select" ON stock FOR SELECT
  USING (usuario_en_local(id_local) OR es_admin_empresa(id_empresa));

CREATE POLICY "stock_update" ON stock FOR UPDATE
  USING (es_admin_local(id_local) OR es_admin_empresa(id_empresa));
```

---

## Dashboard del admin_empresa — patrón de query

El `admin_empresa` necesita ver agregados de TODOS sus locales sin
tener que filtrar por local. Usar `id_empresa` en las queries:

```typescript
// Ventas totales de la empresa (todos los locales)
const { data: ventasGlobales } = await supabase
  .from('ventas')
  .select('id_local, total, created_at')
  .eq('id_empresa', empresaId)

// Ventas agrupadas por local (para el dashboard comparativo)
const { data: ventasPorLocal } = await supabase
  .from('ventas')
  .select(`
    id_local,
    locales(nombre),
    total.sum()
  `)
  .eq('id_empresa', empresaId)

// Filtrado por local específico (cuando elige un local)
const { data: ventasLocal } = await supabase
  .from('ventas')
  .select('*')
  .eq('id_local', localSeleccionado)
```

---

## Checklist antes de hacer deploy

- [ ] Todas las tablas tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Todas las tablas tienen al menos una policy SELECT
- [ ] Las funciones helper usan `SECURITY DEFINER` (para evitar recursión en RLS)
- [ ] Los índices sobre `id_empresa` e `id_local` están creados (performance RLS)
- [ ] Tabla `membresias` tiene constraint que evita `admin_empresa` con `id_local`
- [ ] Verificar con `supabase test db` antes de cada deploy
