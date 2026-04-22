-- ==========================================
-- SCRIPT DE DESPLIEGUE TOTAL (Sincronización Completa)
-- ==========================================

-- 1. EXTENSIONES (Seguras)
DO $$ 
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions"; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions"; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 2. TIPOS CUSTOM
DO $$ BEGIN
    CREATE TYPE "public"."t_estado_comprobante" AS ENUM ('pendiente', 'pagado', 'anulado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."t_tipo_comprobante" AS ENUM ('factura', 'presupuesto', 'recibo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABLAS DE CONFIGURACIÓN (t_conf_...)
CREATE TABLE IF NOT EXISTS "public"."t_conf_acabados" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_cant_copias" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_peliculados" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_sistemas_impresion" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_soportes" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_tamanios_papel" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_terminaciones" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_tipos_entrega" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_conf_tipos_gasto" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

-- 4. TABLAS DE NEGOCIO RESTANTES
CREATE TABLE IF NOT EXISTS "public"."t_roles" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(100) NOT NULL UNIQUE,
    "permisos" text,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."t_proveedores" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "nombre" character varying(255) NOT NULL,
    "cuit" character varying(20),
    "razon_social" character varying(255),
    "direccion" character varying(255),
    "localidad" character varying(255),
    "telefonos" character varying(100),
    "email" character varying(200),
    "created_at" timestamp with time zone DEFAULT now()
);

-- 5. RE-APLICAR TABLAS PRINCIPALES CON SUS RELACIONES CORRECTAS
-- (Uso CREATE TABLE IF NOT EXISTS para no borrar datos si ya existen)

CREATE TABLE IF NOT EXISTS "public"."t_clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() PRIMARY KEY,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nombre" "text",
    "razon_social" text,
    "cuit" "text",
    "telefono" "text",
    "email" "text",
    "direccion" "text",
    "es_mayorista" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS "public"."t_productos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() PRIMARY KEY,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "precio_costo" numeric(12,2) DEFAULT 0,
    "precio_minorista" numeric(12,2) DEFAULT 0,
    "precio_mayorista" numeric(12,2) DEFAULT 0,
    "requiere_numeracion" boolean DEFAULT false,
    "requiere_fecha_muestra" boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS "public"."t_usuarios" (
    "id" "uuid" NOT NULL PRIMARY KEY,
    "rol_id" uuid REFERENCES "public"."t_roles"("id"),
    "email" "text",
    "full_name" "text",
    "nombre" text,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."t_comprobantes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() PRIMARY KEY,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "cliente_id" "uuid" REFERENCES "public"."t_clientes"("id"),
    "usuario_id" uuid REFERENCES "public"."t_usuarios"("id"),
    "tipo" text,
    "numero" "text",
    "total" numeric(12,2) DEFAULT 0,
    "estado" text,
    "notas" "text"
);

CREATE TABLE IF NOT EXISTS "public"."t_comprobante_cobros" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() PRIMARY KEY,
    "comprobante_id" "uuid" REFERENCES "public"."t_comprobantes"("id") ON DELETE CASCADE,
    "monto" numeric(12,2) DEFAULT 0 NOT NULL,
    "fecha" date DEFAULT CURRENT_DATE,
    "tipo_pago" "text" DEFAULT 'EFECTIVO'::"text",
    "referencia" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."t_trabajos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() PRIMARY KEY,
    "cliente_id" "uuid" REFERENCES "public"."t_clientes"("id"),
    "usuario_id" uuid REFERENCES "public"."t_usuarios"("id"),
    "nombre_trabajo" "text",
    "descripcion" "text",
    "estado" "text" DEFAULT 'pendiente'::"text",
    "fecha_entrega" "date",
    "total" numeric(12,2) DEFAULT 0,
    "sena" numeric(12,2) DEFAULT 0,
    "acabado_id" uuid REFERENCES "public"."t_conf_acabados"("id"),
    "soporte_id" uuid REFERENCES "public"."t_conf_soportes"("id"),
    "sistema_impresion_id" uuid REFERENCES "public"."t_conf_sistemas_impresion"("id"),
    "tamanio_papel_id" uuid REFERENCES "public"."t_conf_tamanios_papel"("id"),
    "terminacion_id" uuid REFERENCES "public"."t_conf_terminaciones"("id")
);

CREATE TABLE IF NOT EXISTS "public"."t_trabajo_productos" (
    "id" uuid NOT NULL DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    "trabajo_id" uuid REFERENCES "public"."t_trabajos"("id") ON DELETE CASCADE,
    "producto_id" uuid REFERENCES "public"."t_productos"("id"),
    "cantidad" integer DEFAULT 1,
    "tipo_precio" character varying(20) DEFAULT 'minorista',
    "precio_unitario" numeric(12,2) DEFAULT 0,
    "subtotal" numeric(12,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT now()
);

-- 6. SEGURIDAD (Habilitar RLS para todas)
ALTER TABLE "public"."t_conf_acabados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_cant_copias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_peliculados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_sistemas_impresion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_soportes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_tamanios_papel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_terminaciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_tipos_entrega" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_conf_tipos_gasto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_proveedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."t_trabajo_productos" ENABLE ROW LEVEL SECURITY;

-- 7. POLITICAS (Acceso total para autenticados)
DO $$ 
DECLARE 
    t text;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 't_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Allow all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;
