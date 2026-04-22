
  create table "public"."t_aperturas_caja" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "usuario_id" uuid,
    "fecha_apertura" date,
    "fecha_cierre" date,
    "saldo_inicio" numeric(12,2) default 0,
    "saldo_cierre" numeric(12,2) default 0,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_clientes" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "cuit" character varying(20),
    "razon_social" character varying(255),
    "nombre_fantasia" character varying(255),
    "rubro" character varying(255),
    "direccion" character varying(255),
    "localidad" character varying(255),
    "telefonos" character varying(100),
    "email" character varying(200),
    "contactos" character varying(255),
    "situacion_iva" character varying(100) default 'Ninguno'::character varying,
    "nro_iibb" character varying(50),
    "nro_municipal" character varying(50),
    "nro_caja_prevision" character varying(50),
    "inicio_actividad" date,
    "observaciones" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_clientes" enable row level security;


  create table "public"."t_comprobante_cobros" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "comprobante_id" uuid,
    "tipo" character varying(50) default 'Ninguno'::character varying,
    "importe" numeric(12,2) default 0,
    "observaciones" text,
    "fecha_cheque" date
      );



  create table "public"."t_comprobante_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "comprobante_id" uuid,
    "producto_id" uuid,
    "cantidad" numeric(12,2) default 0,
    "descripcion" text,
    "precio_total" numeric(12,2) default 0
      );



  create table "public"."t_comprobante_trabajos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "comprobante_id" uuid,
    "trabajo_id" uuid
      );



  create table "public"."t_comprobantes" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "cliente_id" uuid,
    "usuario_id" uuid,
    "tipo" character varying(50) default 'Ninguno'::character varying,
    "fecha" date default CURRENT_DATE,
    "fecha_vencimiento" date,
    "numero" character varying(50),
    "numero_remito" character varying(50),
    "tipo_pago" character varying(100),
    "subtotal" numeric(12,2) default 0,
    "iva" numeric(12,2) default 0,
    "total" numeric(12,2) default 0,
    "observaciones" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_comprobantes" enable row level security;


  create table "public"."t_conf_acabados" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_cant_copias" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_peliculados" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_sistemas_impresion" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_soportes" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_tamanios_papel" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_terminaciones" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_tipos_entrega" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_conf_tipos_gasto" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_factura_compra_pagos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "factura_compra_id" uuid,
    "tipo" character varying(50) default 'Ninguno'::character varying,
    "fecha" date,
    "importe" numeric(12,2) default 0,
    "observaciones" text
      );



  create table "public"."t_facturas_compra" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "proveedor_id" uuid,
    "usuario_id" uuid,
    "tipo_factura" character varying(10),
    "tipo" character varying(50) default 'Ninguno'::character varying,
    "tipo_gasto_id" uuid,
    "cuit" character varying(20),
    "razon_social" character varying(255),
    "fecha" date,
    "fecha_vencimiento" date,
    "numero" character varying(50),
    "per_iva" numeric(12,2) default 0,
    "per_ganancias" numeric(12,2) default 0,
    "per_iibb" numeric(12,2) default 0,
    "per_sus" numeric(12,2) default 0,
    "subtotal" numeric(12,2) default 0,
    "iva21" numeric(12,2) default 0,
    "iva27" numeric(12,2) default 0,
    "iva105" numeric(12,2) default 0,
    "no_gravados" numeric(12,2) default 0,
    "total" numeric(12,2) default 0,
    "observaciones" text,
    "fecha_carga" date default CURRENT_DATE,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_facturas_compra" enable row level security;


  create table "public"."t_presupuesto_items_producto" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "presupuesto_id" uuid,
    "producto_id" uuid,
    "cantidad" integer default 0,
    "descripcion" text,
    "precio" numeric(12,2) default 0,
    "es_chico" boolean default false
      );



  create table "public"."t_presupuesto_items_trabajo" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "presupuesto_id" uuid,
    "descripcion" text,
    "cantidad" integer default 0,
    "diseno" numeric(12,2) default 0,
    "peliculas" numeric(12,2) default 0,
    "chapas" numeric(12,2) default 0,
    "lavados" numeric(12,2) default 0,
    "papel" numeric(12,2) default 0,
    "impresion" numeric(12,2) default 0,
    "numeracion" numeric(12,2) default 0,
    "maquila_doble" numeric(12,2) default 0,
    "pegado" numeric(12,2) default 0,
    "tintas_inter" numeric(12,2) default 0,
    "cortes" numeric(12,2) default 0,
    "troquelado" numeric(12,2) default 0,
    "acabado" numeric(12,2) default 0,
    "encuadernacion" numeric(12,2) default 0,
    "otros" numeric(12,2) default 0,
    "total" numeric(12,2) default 0
      );



  create table "public"."t_presupuestos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "cliente_id" uuid,
    "usuario_id" uuid,
    "numero" integer,
    "fecha" date default CURRENT_DATE,
    "observaciones" text,
    "estado" character varying(50) default 'Presupuesto'::character varying,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_presupuestos" enable row level security;


  create table "public"."t_productos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(255) not null,
    "descripcion" text,
    "precio" numeric(12,2) default 0,
    "activo" boolean default true,
    "created_at" timestamp with time zone default now(),
    "categoria" character varying(100),
    "stock" numeric(12,2) default 0
      );



  create table "public"."t_proveedores" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(255) not null,
    "cuit" character varying(20),
    "razon_social" character varying(255),
    "direccion" character varying(255),
    "localidad" character varying(255),
    "telefonos" character varying(100),
    "email" character varying(200),
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_recibo_facturas" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "recibo_id" uuid,
    "comprobante_id" uuid,
    "monto_aplicado" numeric(12,2) default 0
      );



  create table "public"."t_recibo_items" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "recibo_id" uuid,
    "tipo" character varying(50) default 'Ninguno'::character varying,
    "importe" numeric(12,2) default 0,
    "observaciones" text,
    "fecha_cheque" date
      );



  create table "public"."t_recibos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "cliente_id" uuid,
    "usuario_id" uuid,
    "fecha" date default CURRENT_DATE,
    "numero" character varying(50),
    "total" numeric(12,2) default 0,
    "observaciones" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_recibos" enable row level security;


  create table "public"."t_roles" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "nombre" character varying(100) not null,
    "permisos" text,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."t_trabajos" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "cliente_id" uuid,
    "producto_id" uuid,
    "presupuesto_id" uuid,
    "usuario_id" uuid,
    "estado" character varying(50) default 'EN PRODUCCION'::character varying,
    "cantidad" integer default 0,
    "total" numeric(12,2) default 0,
    "sena" numeric(12,2) default 0,
    "descripcion" text,
    "fecha" date,
    "fecha_entrega" date,
    "fecha_prod_inicio" date,
    "fecha_prod_fin" date,
    "fecha_muestra" date,
    "fecha_entregado" date,
    "muestra_realizada" boolean default false,
    "observaciones" text,
    "numeracion_desde" character varying(100),
    "numeracion_hasta" character varying(100),
    "fecha_venc_talonarios" date,
    "cant_copias_id" uuid,
    "soporte_id" uuid,
    "sistema_impresion_id" uuid,
    "peliculado_id" uuid,
    "acabado_id" uuid,
    "terminacion_id" uuid,
    "tamanio_papel_id" uuid,
    "tamanio_otro" character varying(100),
    "numerado" boolean default false,
    "troquelado" boolean default false,
    "troquel_cliente" boolean default false,
    "perforado" boolean default false,
    "cant_tinta" integer,
    "color_tinta" character varying(255),
    "color_papel" character varying(255),
    "tipo_entrega_id" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_trabajos" enable row level security;


  create table "public"."t_usuarios" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "rol_id" uuid,
    "nombre" character varying(200) not null,
    "email" character varying(200) not null,
    "password_hash" character varying(255),
    "activo" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."t_usuarios" enable row level security;

CREATE INDEX idx_clientes_cuit ON public.t_clientes USING btree (cuit);

CREATE INDEX idx_comprobantes_cliente ON public.t_comprobantes USING btree (cliente_id);

CREATE INDEX idx_facturas_compra_proveedor ON public.t_facturas_compra USING btree (proveedor_id);

CREATE INDEX idx_presupuestos_cliente ON public.t_presupuestos USING btree (cliente_id);

CREATE INDEX idx_recibos_cliente ON public.t_recibos USING btree (cliente_id);

CREATE INDEX idx_trabajos_cliente ON public.t_trabajos USING btree (cliente_id);

CREATE INDEX idx_trabajos_estado ON public.t_trabajos USING btree (estado);

CREATE UNIQUE INDEX t_aperturas_caja_pkey ON public.t_aperturas_caja USING btree (id);

CREATE UNIQUE INDEX t_clientes_pkey ON public.t_clientes USING btree (id);

CREATE UNIQUE INDEX t_comprobante_cobros_pkey ON public.t_comprobante_cobros USING btree (id);

CREATE UNIQUE INDEX t_comprobante_items_pkey ON public.t_comprobante_items USING btree (id);

CREATE UNIQUE INDEX t_comprobante_trabajos_pkey ON public.t_comprobante_trabajos USING btree (id);

CREATE UNIQUE INDEX t_comprobantes_pkey ON public.t_comprobantes USING btree (id);

CREATE UNIQUE INDEX t_conf_acabados_pkey ON public.t_conf_acabados USING btree (id);

CREATE UNIQUE INDEX t_conf_cant_copias_pkey ON public.t_conf_cant_copias USING btree (id);

CREATE UNIQUE INDEX t_conf_peliculados_pkey ON public.t_conf_peliculados USING btree (id);

CREATE UNIQUE INDEX t_conf_sistemas_impresion_pkey ON public.t_conf_sistemas_impresion USING btree (id);

CREATE UNIQUE INDEX t_conf_soportes_pkey ON public.t_conf_soportes USING btree (id);

CREATE UNIQUE INDEX t_conf_tamanios_papel_pkey ON public.t_conf_tamanios_papel USING btree (id);

CREATE UNIQUE INDEX t_conf_terminaciones_pkey ON public.t_conf_terminaciones USING btree (id);

CREATE UNIQUE INDEX t_conf_tipos_entrega_pkey ON public.t_conf_tipos_entrega USING btree (id);

CREATE UNIQUE INDEX t_conf_tipos_gasto_pkey ON public.t_conf_tipos_gasto USING btree (id);

CREATE UNIQUE INDEX t_factura_compra_pagos_pkey ON public.t_factura_compra_pagos USING btree (id);

CREATE UNIQUE INDEX t_facturas_compra_pkey ON public.t_facturas_compra USING btree (id);

CREATE UNIQUE INDEX t_presupuesto_items_producto_pkey ON public.t_presupuesto_items_producto USING btree (id);

CREATE UNIQUE INDEX t_presupuesto_items_trabajo_pkey ON public.t_presupuesto_items_trabajo USING btree (id);

CREATE UNIQUE INDEX t_presupuestos_pkey ON public.t_presupuestos USING btree (id);

CREATE UNIQUE INDEX t_productos_pkey ON public.t_productos USING btree (id);

CREATE UNIQUE INDEX t_proveedores_pkey ON public.t_proveedores USING btree (id);

CREATE UNIQUE INDEX t_recibo_facturas_pkey ON public.t_recibo_facturas USING btree (id);

CREATE UNIQUE INDEX t_recibo_items_pkey ON public.t_recibo_items USING btree (id);

CREATE UNIQUE INDEX t_recibos_pkey ON public.t_recibos USING btree (id);

CREATE UNIQUE INDEX t_roles_nombre_key ON public.t_roles USING btree (nombre);

CREATE UNIQUE INDEX t_roles_pkey ON public.t_roles USING btree (id);

CREATE UNIQUE INDEX t_trabajos_pkey ON public.t_trabajos USING btree (id);

CREATE UNIQUE INDEX t_usuarios_email_key ON public.t_usuarios USING btree (email);

CREATE UNIQUE INDEX t_usuarios_pkey ON public.t_usuarios USING btree (id);

alter table "public"."t_aperturas_caja" add constraint "t_aperturas_caja_pkey" PRIMARY KEY using index "t_aperturas_caja_pkey";

alter table "public"."t_clientes" add constraint "t_clientes_pkey" PRIMARY KEY using index "t_clientes_pkey";

alter table "public"."t_comprobante_cobros" add constraint "t_comprobante_cobros_pkey" PRIMARY KEY using index "t_comprobante_cobros_pkey";

alter table "public"."t_comprobante_items" add constraint "t_comprobante_items_pkey" PRIMARY KEY using index "t_comprobante_items_pkey";

alter table "public"."t_comprobante_trabajos" add constraint "t_comprobante_trabajos_pkey" PRIMARY KEY using index "t_comprobante_trabajos_pkey";

alter table "public"."t_comprobantes" add constraint "t_comprobantes_pkey" PRIMARY KEY using index "t_comprobantes_pkey";

alter table "public"."t_conf_acabados" add constraint "t_conf_acabados_pkey" PRIMARY KEY using index "t_conf_acabados_pkey";

alter table "public"."t_conf_cant_copias" add constraint "t_conf_cant_copias_pkey" PRIMARY KEY using index "t_conf_cant_copias_pkey";

alter table "public"."t_conf_peliculados" add constraint "t_conf_peliculados_pkey" PRIMARY KEY using index "t_conf_peliculados_pkey";

alter table "public"."t_conf_sistemas_impresion" add constraint "t_conf_sistemas_impresion_pkey" PRIMARY KEY using index "t_conf_sistemas_impresion_pkey";

alter table "public"."t_conf_soportes" add constraint "t_conf_soportes_pkey" PRIMARY KEY using index "t_conf_soportes_pkey";

alter table "public"."t_conf_tamanios_papel" add constraint "t_conf_tamanios_papel_pkey" PRIMARY KEY using index "t_conf_tamanios_papel_pkey";

alter table "public"."t_conf_terminaciones" add constraint "t_conf_terminaciones_pkey" PRIMARY KEY using index "t_conf_terminaciones_pkey";

alter table "public"."t_conf_tipos_entrega" add constraint "t_conf_tipos_entrega_pkey" PRIMARY KEY using index "t_conf_tipos_entrega_pkey";

alter table "public"."t_conf_tipos_gasto" add constraint "t_conf_tipos_gasto_pkey" PRIMARY KEY using index "t_conf_tipos_gasto_pkey";

alter table "public"."t_factura_compra_pagos" add constraint "t_factura_compra_pagos_pkey" PRIMARY KEY using index "t_factura_compra_pagos_pkey";

alter table "public"."t_facturas_compra" add constraint "t_facturas_compra_pkey" PRIMARY KEY using index "t_facturas_compra_pkey";

alter table "public"."t_presupuesto_items_producto" add constraint "t_presupuesto_items_producto_pkey" PRIMARY KEY using index "t_presupuesto_items_producto_pkey";

alter table "public"."t_presupuesto_items_trabajo" add constraint "t_presupuesto_items_trabajo_pkey" PRIMARY KEY using index "t_presupuesto_items_trabajo_pkey";

alter table "public"."t_presupuestos" add constraint "t_presupuestos_pkey" PRIMARY KEY using index "t_presupuestos_pkey";

alter table "public"."t_productos" add constraint "t_productos_pkey" PRIMARY KEY using index "t_productos_pkey";

alter table "public"."t_proveedores" add constraint "t_proveedores_pkey" PRIMARY KEY using index "t_proveedores_pkey";

alter table "public"."t_recibo_facturas" add constraint "t_recibo_facturas_pkey" PRIMARY KEY using index "t_recibo_facturas_pkey";

alter table "public"."t_recibo_items" add constraint "t_recibo_items_pkey" PRIMARY KEY using index "t_recibo_items_pkey";

alter table "public"."t_recibos" add constraint "t_recibos_pkey" PRIMARY KEY using index "t_recibos_pkey";

alter table "public"."t_roles" add constraint "t_roles_pkey" PRIMARY KEY using index "t_roles_pkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_pkey" PRIMARY KEY using index "t_trabajos_pkey";

alter table "public"."t_usuarios" add constraint "t_usuarios_pkey" PRIMARY KEY using index "t_usuarios_pkey";

alter table "public"."t_aperturas_caja" add constraint "t_aperturas_caja_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_aperturas_caja" validate constraint "t_aperturas_caja_usuario_id_fkey";

alter table "public"."t_comprobante_cobros" add constraint "t_comprobante_cobros_comprobante_id_fkey" FOREIGN KEY (comprobante_id) REFERENCES public.t_comprobantes(id) ON DELETE CASCADE not valid;

alter table "public"."t_comprobante_cobros" validate constraint "t_comprobante_cobros_comprobante_id_fkey";

alter table "public"."t_comprobante_items" add constraint "t_comprobante_items_comprobante_id_fkey" FOREIGN KEY (comprobante_id) REFERENCES public.t_comprobantes(id) ON DELETE CASCADE not valid;

alter table "public"."t_comprobante_items" validate constraint "t_comprobante_items_comprobante_id_fkey";

alter table "public"."t_comprobante_items" add constraint "t_comprobante_items_producto_id_fkey" FOREIGN KEY (producto_id) REFERENCES public.t_productos(id) not valid;

alter table "public"."t_comprobante_items" validate constraint "t_comprobante_items_producto_id_fkey";

alter table "public"."t_comprobante_trabajos" add constraint "t_comprobante_trabajos_comprobante_id_fkey" FOREIGN KEY (comprobante_id) REFERENCES public.t_comprobantes(id) ON DELETE CASCADE not valid;

alter table "public"."t_comprobante_trabajos" validate constraint "t_comprobante_trabajos_comprobante_id_fkey";

alter table "public"."t_comprobante_trabajos" add constraint "t_comprobante_trabajos_trabajo_id_fkey" FOREIGN KEY (trabajo_id) REFERENCES public.t_trabajos(id) not valid;

alter table "public"."t_comprobante_trabajos" validate constraint "t_comprobante_trabajos_trabajo_id_fkey";

alter table "public"."t_comprobantes" add constraint "t_comprobantes_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES public.t_clientes(id) not valid;

alter table "public"."t_comprobantes" validate constraint "t_comprobantes_cliente_id_fkey";

alter table "public"."t_comprobantes" add constraint "t_comprobantes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_comprobantes" validate constraint "t_comprobantes_usuario_id_fkey";

alter table "public"."t_factura_compra_pagos" add constraint "t_factura_compra_pagos_factura_compra_id_fkey" FOREIGN KEY (factura_compra_id) REFERENCES public.t_facturas_compra(id) ON DELETE CASCADE not valid;

alter table "public"."t_factura_compra_pagos" validate constraint "t_factura_compra_pagos_factura_compra_id_fkey";

alter table "public"."t_facturas_compra" add constraint "t_facturas_compra_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES public.t_proveedores(id) not valid;

alter table "public"."t_facturas_compra" validate constraint "t_facturas_compra_proveedor_id_fkey";

alter table "public"."t_facturas_compra" add constraint "t_facturas_compra_tipo_gasto_id_fkey" FOREIGN KEY (tipo_gasto_id) REFERENCES public.t_conf_tipos_gasto(id) not valid;

alter table "public"."t_facturas_compra" validate constraint "t_facturas_compra_tipo_gasto_id_fkey";

alter table "public"."t_facturas_compra" add constraint "t_facturas_compra_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_facturas_compra" validate constraint "t_facturas_compra_usuario_id_fkey";

alter table "public"."t_presupuesto_items_producto" add constraint "t_presupuesto_items_producto_presupuesto_id_fkey" FOREIGN KEY (presupuesto_id) REFERENCES public.t_presupuestos(id) ON DELETE CASCADE not valid;

alter table "public"."t_presupuesto_items_producto" validate constraint "t_presupuesto_items_producto_presupuesto_id_fkey";

alter table "public"."t_presupuesto_items_producto" add constraint "t_presupuesto_items_producto_producto_id_fkey" FOREIGN KEY (producto_id) REFERENCES public.t_productos(id) not valid;

alter table "public"."t_presupuesto_items_producto" validate constraint "t_presupuesto_items_producto_producto_id_fkey";

alter table "public"."t_presupuesto_items_trabajo" add constraint "t_presupuesto_items_trabajo_presupuesto_id_fkey" FOREIGN KEY (presupuesto_id) REFERENCES public.t_presupuestos(id) ON DELETE CASCADE not valid;

alter table "public"."t_presupuesto_items_trabajo" validate constraint "t_presupuesto_items_trabajo_presupuesto_id_fkey";

alter table "public"."t_presupuestos" add constraint "t_presupuestos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES public.t_clientes(id) not valid;

alter table "public"."t_presupuestos" validate constraint "t_presupuestos_cliente_id_fkey";

alter table "public"."t_presupuestos" add constraint "t_presupuestos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_presupuestos" validate constraint "t_presupuestos_usuario_id_fkey";

alter table "public"."t_recibo_facturas" add constraint "t_recibo_facturas_comprobante_id_fkey" FOREIGN KEY (comprobante_id) REFERENCES public.t_comprobantes(id) not valid;

alter table "public"."t_recibo_facturas" validate constraint "t_recibo_facturas_comprobante_id_fkey";

alter table "public"."t_recibo_facturas" add constraint "t_recibo_facturas_recibo_id_fkey" FOREIGN KEY (recibo_id) REFERENCES public.t_recibos(id) ON DELETE CASCADE not valid;

alter table "public"."t_recibo_facturas" validate constraint "t_recibo_facturas_recibo_id_fkey";

alter table "public"."t_recibo_items" add constraint "t_recibo_items_recibo_id_fkey" FOREIGN KEY (recibo_id) REFERENCES public.t_recibos(id) ON DELETE CASCADE not valid;

alter table "public"."t_recibo_items" validate constraint "t_recibo_items_recibo_id_fkey";

alter table "public"."t_recibos" add constraint "t_recibos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES public.t_clientes(id) not valid;

alter table "public"."t_recibos" validate constraint "t_recibos_cliente_id_fkey";

alter table "public"."t_recibos" add constraint "t_recibos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_recibos" validate constraint "t_recibos_usuario_id_fkey";

alter table "public"."t_roles" add constraint "t_roles_nombre_key" UNIQUE using index "t_roles_nombre_key";

alter table "public"."t_trabajos" add constraint "t_trabajos_acabado_id_fkey" FOREIGN KEY (acabado_id) REFERENCES public.t_conf_acabados(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_acabado_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_cant_copias_id_fkey" FOREIGN KEY (cant_copias_id) REFERENCES public.t_conf_cant_copias(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_cant_copias_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_cliente_id_fkey" FOREIGN KEY (cliente_id) REFERENCES public.t_clientes(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_cliente_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_peliculado_id_fkey" FOREIGN KEY (peliculado_id) REFERENCES public.t_conf_peliculados(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_peliculado_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_presupuesto_id_fkey" FOREIGN KEY (presupuesto_id) REFERENCES public.t_presupuestos(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_presupuesto_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_producto_id_fkey" FOREIGN KEY (producto_id) REFERENCES public.t_productos(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_producto_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_sistema_impresion_id_fkey" FOREIGN KEY (sistema_impresion_id) REFERENCES public.t_conf_sistemas_impresion(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_sistema_impresion_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_soporte_id_fkey" FOREIGN KEY (soporte_id) REFERENCES public.t_conf_soportes(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_soporte_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_tamanio_papel_id_fkey" FOREIGN KEY (tamanio_papel_id) REFERENCES public.t_conf_tamanios_papel(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_tamanio_papel_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_terminacion_id_fkey" FOREIGN KEY (terminacion_id) REFERENCES public.t_conf_terminaciones(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_terminacion_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_tipo_entrega_id_fkey" FOREIGN KEY (tipo_entrega_id) REFERENCES public.t_conf_tipos_entrega(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_tipo_entrega_id_fkey";

alter table "public"."t_trabajos" add constraint "t_trabajos_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES public.t_usuarios(id) not valid;

alter table "public"."t_trabajos" validate constraint "t_trabajos_usuario_id_fkey";

alter table "public"."t_usuarios" add constraint "t_usuarios_email_key" UNIQUE using index "t_usuarios_email_key";

alter table "public"."t_usuarios" add constraint "t_usuarios_rol_id_fkey" FOREIGN KEY (rol_id) REFERENCES public.t_roles(id) not valid;

alter table "public"."t_usuarios" validate constraint "t_usuarios_rol_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$BEGIN INSERT INTO public.t_usuarios (id, email, nombre, rol_id, activo) VALUES (new.id, new.email, split_part(new.email, '@', 1), 'f0360270-5058-4bd8-8e26-e4ffa3ac8141', true); RETURN new; END;$function$
;

grant delete on table "public"."t_aperturas_caja" to "anon";

grant insert on table "public"."t_aperturas_caja" to "anon";

grant references on table "public"."t_aperturas_caja" to "anon";

grant select on table "public"."t_aperturas_caja" to "anon";

grant trigger on table "public"."t_aperturas_caja" to "anon";

grant truncate on table "public"."t_aperturas_caja" to "anon";

grant update on table "public"."t_aperturas_caja" to "anon";

grant delete on table "public"."t_aperturas_caja" to "authenticated";

grant insert on table "public"."t_aperturas_caja" to "authenticated";

grant references on table "public"."t_aperturas_caja" to "authenticated";

grant select on table "public"."t_aperturas_caja" to "authenticated";

grant trigger on table "public"."t_aperturas_caja" to "authenticated";

grant truncate on table "public"."t_aperturas_caja" to "authenticated";

grant update on table "public"."t_aperturas_caja" to "authenticated";

grant delete on table "public"."t_aperturas_caja" to "postgres";

grant insert on table "public"."t_aperturas_caja" to "postgres";

grant references on table "public"."t_aperturas_caja" to "postgres";

grant select on table "public"."t_aperturas_caja" to "postgres";

grant trigger on table "public"."t_aperturas_caja" to "postgres";

grant truncate on table "public"."t_aperturas_caja" to "postgres";

grant update on table "public"."t_aperturas_caja" to "postgres";

grant delete on table "public"."t_aperturas_caja" to "service_role";

grant insert on table "public"."t_aperturas_caja" to "service_role";

grant references on table "public"."t_aperturas_caja" to "service_role";

grant select on table "public"."t_aperturas_caja" to "service_role";

grant trigger on table "public"."t_aperturas_caja" to "service_role";

grant truncate on table "public"."t_aperturas_caja" to "service_role";

grant update on table "public"."t_aperturas_caja" to "service_role";

grant delete on table "public"."t_clientes" to "anon";

grant insert on table "public"."t_clientes" to "anon";

grant references on table "public"."t_clientes" to "anon";

grant select on table "public"."t_clientes" to "anon";

grant trigger on table "public"."t_clientes" to "anon";

grant truncate on table "public"."t_clientes" to "anon";

grant update on table "public"."t_clientes" to "anon";

grant delete on table "public"."t_clientes" to "authenticated";

grant insert on table "public"."t_clientes" to "authenticated";

grant references on table "public"."t_clientes" to "authenticated";

grant select on table "public"."t_clientes" to "authenticated";

grant trigger on table "public"."t_clientes" to "authenticated";

grant truncate on table "public"."t_clientes" to "authenticated";

grant update on table "public"."t_clientes" to "authenticated";

grant delete on table "public"."t_clientes" to "postgres";

grant insert on table "public"."t_clientes" to "postgres";

grant references on table "public"."t_clientes" to "postgres";

grant select on table "public"."t_clientes" to "postgres";

grant trigger on table "public"."t_clientes" to "postgres";

grant truncate on table "public"."t_clientes" to "postgres";

grant update on table "public"."t_clientes" to "postgres";

grant delete on table "public"."t_clientes" to "service_role";

grant insert on table "public"."t_clientes" to "service_role";

grant references on table "public"."t_clientes" to "service_role";

grant select on table "public"."t_clientes" to "service_role";

grant trigger on table "public"."t_clientes" to "service_role";

grant truncate on table "public"."t_clientes" to "service_role";

grant update on table "public"."t_clientes" to "service_role";

grant delete on table "public"."t_comprobante_cobros" to "anon";

grant insert on table "public"."t_comprobante_cobros" to "anon";

grant references on table "public"."t_comprobante_cobros" to "anon";

grant select on table "public"."t_comprobante_cobros" to "anon";

grant trigger on table "public"."t_comprobante_cobros" to "anon";

grant truncate on table "public"."t_comprobante_cobros" to "anon";

grant update on table "public"."t_comprobante_cobros" to "anon";

grant delete on table "public"."t_comprobante_cobros" to "authenticated";

grant insert on table "public"."t_comprobante_cobros" to "authenticated";

grant references on table "public"."t_comprobante_cobros" to "authenticated";

grant select on table "public"."t_comprobante_cobros" to "authenticated";

grant trigger on table "public"."t_comprobante_cobros" to "authenticated";

grant truncate on table "public"."t_comprobante_cobros" to "authenticated";

grant update on table "public"."t_comprobante_cobros" to "authenticated";

grant delete on table "public"."t_comprobante_cobros" to "postgres";

grant insert on table "public"."t_comprobante_cobros" to "postgres";

grant references on table "public"."t_comprobante_cobros" to "postgres";

grant select on table "public"."t_comprobante_cobros" to "postgres";

grant trigger on table "public"."t_comprobante_cobros" to "postgres";

grant truncate on table "public"."t_comprobante_cobros" to "postgres";

grant update on table "public"."t_comprobante_cobros" to "postgres";

grant delete on table "public"."t_comprobante_cobros" to "service_role";

grant insert on table "public"."t_comprobante_cobros" to "service_role";

grant references on table "public"."t_comprobante_cobros" to "service_role";

grant select on table "public"."t_comprobante_cobros" to "service_role";

grant trigger on table "public"."t_comprobante_cobros" to "service_role";

grant truncate on table "public"."t_comprobante_cobros" to "service_role";

grant update on table "public"."t_comprobante_cobros" to "service_role";

grant delete on table "public"."t_comprobante_items" to "anon";

grant insert on table "public"."t_comprobante_items" to "anon";

grant references on table "public"."t_comprobante_items" to "anon";

grant select on table "public"."t_comprobante_items" to "anon";

grant trigger on table "public"."t_comprobante_items" to "anon";

grant truncate on table "public"."t_comprobante_items" to "anon";

grant update on table "public"."t_comprobante_items" to "anon";

grant delete on table "public"."t_comprobante_items" to "authenticated";

grant insert on table "public"."t_comprobante_items" to "authenticated";

grant references on table "public"."t_comprobante_items" to "authenticated";

grant select on table "public"."t_comprobante_items" to "authenticated";

grant trigger on table "public"."t_comprobante_items" to "authenticated";

grant truncate on table "public"."t_comprobante_items" to "authenticated";

grant update on table "public"."t_comprobante_items" to "authenticated";

grant delete on table "public"."t_comprobante_items" to "postgres";

grant insert on table "public"."t_comprobante_items" to "postgres";

grant references on table "public"."t_comprobante_items" to "postgres";

grant select on table "public"."t_comprobante_items" to "postgres";

grant trigger on table "public"."t_comprobante_items" to "postgres";

grant truncate on table "public"."t_comprobante_items" to "postgres";

grant update on table "public"."t_comprobante_items" to "postgres";

grant delete on table "public"."t_comprobante_items" to "service_role";

grant insert on table "public"."t_comprobante_items" to "service_role";

grant references on table "public"."t_comprobante_items" to "service_role";

grant select on table "public"."t_comprobante_items" to "service_role";

grant trigger on table "public"."t_comprobante_items" to "service_role";

grant truncate on table "public"."t_comprobante_items" to "service_role";

grant update on table "public"."t_comprobante_items" to "service_role";

grant delete on table "public"."t_comprobante_trabajos" to "anon";

grant insert on table "public"."t_comprobante_trabajos" to "anon";

grant references on table "public"."t_comprobante_trabajos" to "anon";

grant select on table "public"."t_comprobante_trabajos" to "anon";

grant trigger on table "public"."t_comprobante_trabajos" to "anon";

grant truncate on table "public"."t_comprobante_trabajos" to "anon";

grant update on table "public"."t_comprobante_trabajos" to "anon";

grant delete on table "public"."t_comprobante_trabajos" to "authenticated";

grant insert on table "public"."t_comprobante_trabajos" to "authenticated";

grant references on table "public"."t_comprobante_trabajos" to "authenticated";

grant select on table "public"."t_comprobante_trabajos" to "authenticated";

grant trigger on table "public"."t_comprobante_trabajos" to "authenticated";

grant truncate on table "public"."t_comprobante_trabajos" to "authenticated";

grant update on table "public"."t_comprobante_trabajos" to "authenticated";

grant delete on table "public"."t_comprobante_trabajos" to "postgres";

grant insert on table "public"."t_comprobante_trabajos" to "postgres";

grant references on table "public"."t_comprobante_trabajos" to "postgres";

grant select on table "public"."t_comprobante_trabajos" to "postgres";

grant trigger on table "public"."t_comprobante_trabajos" to "postgres";

grant truncate on table "public"."t_comprobante_trabajos" to "postgres";

grant update on table "public"."t_comprobante_trabajos" to "postgres";

grant delete on table "public"."t_comprobante_trabajos" to "service_role";

grant insert on table "public"."t_comprobante_trabajos" to "service_role";

grant references on table "public"."t_comprobante_trabajos" to "service_role";

grant select on table "public"."t_comprobante_trabajos" to "service_role";

grant trigger on table "public"."t_comprobante_trabajos" to "service_role";

grant truncate on table "public"."t_comprobante_trabajos" to "service_role";

grant update on table "public"."t_comprobante_trabajos" to "service_role";

grant delete on table "public"."t_comprobantes" to "anon";

grant insert on table "public"."t_comprobantes" to "anon";

grant references on table "public"."t_comprobantes" to "anon";

grant select on table "public"."t_comprobantes" to "anon";

grant trigger on table "public"."t_comprobantes" to "anon";

grant truncate on table "public"."t_comprobantes" to "anon";

grant update on table "public"."t_comprobantes" to "anon";

grant delete on table "public"."t_comprobantes" to "authenticated";

grant insert on table "public"."t_comprobantes" to "authenticated";

grant references on table "public"."t_comprobantes" to "authenticated";

grant select on table "public"."t_comprobantes" to "authenticated";

grant trigger on table "public"."t_comprobantes" to "authenticated";

grant truncate on table "public"."t_comprobantes" to "authenticated";

grant update on table "public"."t_comprobantes" to "authenticated";

grant delete on table "public"."t_comprobantes" to "postgres";

grant insert on table "public"."t_comprobantes" to "postgres";

grant references on table "public"."t_comprobantes" to "postgres";

grant select on table "public"."t_comprobantes" to "postgres";

grant trigger on table "public"."t_comprobantes" to "postgres";

grant truncate on table "public"."t_comprobantes" to "postgres";

grant update on table "public"."t_comprobantes" to "postgres";

grant delete on table "public"."t_comprobantes" to "service_role";

grant insert on table "public"."t_comprobantes" to "service_role";

grant references on table "public"."t_comprobantes" to "service_role";

grant select on table "public"."t_comprobantes" to "service_role";

grant trigger on table "public"."t_comprobantes" to "service_role";

grant truncate on table "public"."t_comprobantes" to "service_role";

grant update on table "public"."t_comprobantes" to "service_role";

grant delete on table "public"."t_conf_acabados" to "anon";

grant insert on table "public"."t_conf_acabados" to "anon";

grant references on table "public"."t_conf_acabados" to "anon";

grant select on table "public"."t_conf_acabados" to "anon";

grant trigger on table "public"."t_conf_acabados" to "anon";

grant truncate on table "public"."t_conf_acabados" to "anon";

grant update on table "public"."t_conf_acabados" to "anon";

grant delete on table "public"."t_conf_acabados" to "authenticated";

grant insert on table "public"."t_conf_acabados" to "authenticated";

grant references on table "public"."t_conf_acabados" to "authenticated";

grant select on table "public"."t_conf_acabados" to "authenticated";

grant trigger on table "public"."t_conf_acabados" to "authenticated";

grant truncate on table "public"."t_conf_acabados" to "authenticated";

grant update on table "public"."t_conf_acabados" to "authenticated";

grant delete on table "public"."t_conf_acabados" to "postgres";

grant insert on table "public"."t_conf_acabados" to "postgres";

grant references on table "public"."t_conf_acabados" to "postgres";

grant select on table "public"."t_conf_acabados" to "postgres";

grant trigger on table "public"."t_conf_acabados" to "postgres";

grant truncate on table "public"."t_conf_acabados" to "postgres";

grant update on table "public"."t_conf_acabados" to "postgres";

grant delete on table "public"."t_conf_acabados" to "service_role";

grant insert on table "public"."t_conf_acabados" to "service_role";

grant references on table "public"."t_conf_acabados" to "service_role";

grant select on table "public"."t_conf_acabados" to "service_role";

grant trigger on table "public"."t_conf_acabados" to "service_role";

grant truncate on table "public"."t_conf_acabados" to "service_role";

grant update on table "public"."t_conf_acabados" to "service_role";

grant delete on table "public"."t_conf_cant_copias" to "anon";

grant insert on table "public"."t_conf_cant_copias" to "anon";

grant references on table "public"."t_conf_cant_copias" to "anon";

grant select on table "public"."t_conf_cant_copias" to "anon";

grant trigger on table "public"."t_conf_cant_copias" to "anon";

grant truncate on table "public"."t_conf_cant_copias" to "anon";

grant update on table "public"."t_conf_cant_copias" to "anon";

grant delete on table "public"."t_conf_cant_copias" to "authenticated";

grant insert on table "public"."t_conf_cant_copias" to "authenticated";

grant references on table "public"."t_conf_cant_copias" to "authenticated";

grant select on table "public"."t_conf_cant_copias" to "authenticated";

grant trigger on table "public"."t_conf_cant_copias" to "authenticated";

grant truncate on table "public"."t_conf_cant_copias" to "authenticated";

grant update on table "public"."t_conf_cant_copias" to "authenticated";

grant delete on table "public"."t_conf_cant_copias" to "postgres";

grant insert on table "public"."t_conf_cant_copias" to "postgres";

grant references on table "public"."t_conf_cant_copias" to "postgres";

grant select on table "public"."t_conf_cant_copias" to "postgres";

grant trigger on table "public"."t_conf_cant_copias" to "postgres";

grant truncate on table "public"."t_conf_cant_copias" to "postgres";

grant update on table "public"."t_conf_cant_copias" to "postgres";

grant delete on table "public"."t_conf_cant_copias" to "service_role";

grant insert on table "public"."t_conf_cant_copias" to "service_role";

grant references on table "public"."t_conf_cant_copias" to "service_role";

grant select on table "public"."t_conf_cant_copias" to "service_role";

grant trigger on table "public"."t_conf_cant_copias" to "service_role";

grant truncate on table "public"."t_conf_cant_copias" to "service_role";

grant update on table "public"."t_conf_cant_copias" to "service_role";

grant delete on table "public"."t_conf_peliculados" to "anon";

grant insert on table "public"."t_conf_peliculados" to "anon";

grant references on table "public"."t_conf_peliculados" to "anon";

grant select on table "public"."t_conf_peliculados" to "anon";

grant trigger on table "public"."t_conf_peliculados" to "anon";

grant truncate on table "public"."t_conf_peliculados" to "anon";

grant update on table "public"."t_conf_peliculados" to "anon";

grant delete on table "public"."t_conf_peliculados" to "authenticated";

grant insert on table "public"."t_conf_peliculados" to "authenticated";

grant references on table "public"."t_conf_peliculados" to "authenticated";

grant select on table "public"."t_conf_peliculados" to "authenticated";

grant trigger on table "public"."t_conf_peliculados" to "authenticated";

grant truncate on table "public"."t_conf_peliculados" to "authenticated";

grant update on table "public"."t_conf_peliculados" to "authenticated";

grant delete on table "public"."t_conf_peliculados" to "postgres";

grant insert on table "public"."t_conf_peliculados" to "postgres";

grant references on table "public"."t_conf_peliculados" to "postgres";

grant select on table "public"."t_conf_peliculados" to "postgres";

grant trigger on table "public"."t_conf_peliculados" to "postgres";

grant truncate on table "public"."t_conf_peliculados" to "postgres";

grant update on table "public"."t_conf_peliculados" to "postgres";

grant delete on table "public"."t_conf_peliculados" to "service_role";

grant insert on table "public"."t_conf_peliculados" to "service_role";

grant references on table "public"."t_conf_peliculados" to "service_role";

grant select on table "public"."t_conf_peliculados" to "service_role";

grant trigger on table "public"."t_conf_peliculados" to "service_role";

grant truncate on table "public"."t_conf_peliculados" to "service_role";

grant update on table "public"."t_conf_peliculados" to "service_role";

grant delete on table "public"."t_conf_sistemas_impresion" to "anon";

grant insert on table "public"."t_conf_sistemas_impresion" to "anon";

grant references on table "public"."t_conf_sistemas_impresion" to "anon";

grant select on table "public"."t_conf_sistemas_impresion" to "anon";

grant trigger on table "public"."t_conf_sistemas_impresion" to "anon";

grant truncate on table "public"."t_conf_sistemas_impresion" to "anon";

grant update on table "public"."t_conf_sistemas_impresion" to "anon";

grant delete on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant insert on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant references on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant select on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant trigger on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant truncate on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant update on table "public"."t_conf_sistemas_impresion" to "authenticated";

grant delete on table "public"."t_conf_sistemas_impresion" to "postgres";

grant insert on table "public"."t_conf_sistemas_impresion" to "postgres";

grant references on table "public"."t_conf_sistemas_impresion" to "postgres";

grant select on table "public"."t_conf_sistemas_impresion" to "postgres";

grant trigger on table "public"."t_conf_sistemas_impresion" to "postgres";

grant truncate on table "public"."t_conf_sistemas_impresion" to "postgres";

grant update on table "public"."t_conf_sistemas_impresion" to "postgres";

grant delete on table "public"."t_conf_sistemas_impresion" to "service_role";

grant insert on table "public"."t_conf_sistemas_impresion" to "service_role";

grant references on table "public"."t_conf_sistemas_impresion" to "service_role";

grant select on table "public"."t_conf_sistemas_impresion" to "service_role";

grant trigger on table "public"."t_conf_sistemas_impresion" to "service_role";

grant truncate on table "public"."t_conf_sistemas_impresion" to "service_role";

grant update on table "public"."t_conf_sistemas_impresion" to "service_role";

grant delete on table "public"."t_conf_soportes" to "anon";

grant insert on table "public"."t_conf_soportes" to "anon";

grant references on table "public"."t_conf_soportes" to "anon";

grant select on table "public"."t_conf_soportes" to "anon";

grant trigger on table "public"."t_conf_soportes" to "anon";

grant truncate on table "public"."t_conf_soportes" to "anon";

grant update on table "public"."t_conf_soportes" to "anon";

grant delete on table "public"."t_conf_soportes" to "authenticated";

grant insert on table "public"."t_conf_soportes" to "authenticated";

grant references on table "public"."t_conf_soportes" to "authenticated";

grant select on table "public"."t_conf_soportes" to "authenticated";

grant trigger on table "public"."t_conf_soportes" to "authenticated";

grant truncate on table "public"."t_conf_soportes" to "authenticated";

grant update on table "public"."t_conf_soportes" to "authenticated";

grant delete on table "public"."t_conf_soportes" to "postgres";

grant insert on table "public"."t_conf_soportes" to "postgres";

grant references on table "public"."t_conf_soportes" to "postgres";

grant select on table "public"."t_conf_soportes" to "postgres";

grant trigger on table "public"."t_conf_soportes" to "postgres";

grant truncate on table "public"."t_conf_soportes" to "postgres";

grant update on table "public"."t_conf_soportes" to "postgres";

grant delete on table "public"."t_conf_soportes" to "service_role";

grant insert on table "public"."t_conf_soportes" to "service_role";

grant references on table "public"."t_conf_soportes" to "service_role";

grant select on table "public"."t_conf_soportes" to "service_role";

grant trigger on table "public"."t_conf_soportes" to "service_role";

grant truncate on table "public"."t_conf_soportes" to "service_role";

grant update on table "public"."t_conf_soportes" to "service_role";

grant delete on table "public"."t_conf_tamanios_papel" to "anon";

grant insert on table "public"."t_conf_tamanios_papel" to "anon";

grant references on table "public"."t_conf_tamanios_papel" to "anon";

grant select on table "public"."t_conf_tamanios_papel" to "anon";

grant trigger on table "public"."t_conf_tamanios_papel" to "anon";

grant truncate on table "public"."t_conf_tamanios_papel" to "anon";

grant update on table "public"."t_conf_tamanios_papel" to "anon";

grant delete on table "public"."t_conf_tamanios_papel" to "authenticated";

grant insert on table "public"."t_conf_tamanios_papel" to "authenticated";

grant references on table "public"."t_conf_tamanios_papel" to "authenticated";

grant select on table "public"."t_conf_tamanios_papel" to "authenticated";

grant trigger on table "public"."t_conf_tamanios_papel" to "authenticated";

grant truncate on table "public"."t_conf_tamanios_papel" to "authenticated";

grant update on table "public"."t_conf_tamanios_papel" to "authenticated";

grant delete on table "public"."t_conf_tamanios_papel" to "postgres";

grant insert on table "public"."t_conf_tamanios_papel" to "postgres";

grant references on table "public"."t_conf_tamanios_papel" to "postgres";

grant select on table "public"."t_conf_tamanios_papel" to "postgres";

grant trigger on table "public"."t_conf_tamanios_papel" to "postgres";

grant truncate on table "public"."t_conf_tamanios_papel" to "postgres";

grant update on table "public"."t_conf_tamanios_papel" to "postgres";

grant delete on table "public"."t_conf_tamanios_papel" to "service_role";

grant insert on table "public"."t_conf_tamanios_papel" to "service_role";

grant references on table "public"."t_conf_tamanios_papel" to "service_role";

grant select on table "public"."t_conf_tamanios_papel" to "service_role";

grant trigger on table "public"."t_conf_tamanios_papel" to "service_role";

grant truncate on table "public"."t_conf_tamanios_papel" to "service_role";

grant update on table "public"."t_conf_tamanios_papel" to "service_role";

grant delete on table "public"."t_conf_terminaciones" to "anon";

grant insert on table "public"."t_conf_terminaciones" to "anon";

grant references on table "public"."t_conf_terminaciones" to "anon";

grant select on table "public"."t_conf_terminaciones" to "anon";

grant trigger on table "public"."t_conf_terminaciones" to "anon";

grant truncate on table "public"."t_conf_terminaciones" to "anon";

grant update on table "public"."t_conf_terminaciones" to "anon";

grant delete on table "public"."t_conf_terminaciones" to "authenticated";

grant insert on table "public"."t_conf_terminaciones" to "authenticated";

grant references on table "public"."t_conf_terminaciones" to "authenticated";

grant select on table "public"."t_conf_terminaciones" to "authenticated";

grant trigger on table "public"."t_conf_terminaciones" to "authenticated";

grant truncate on table "public"."t_conf_terminaciones" to "authenticated";

grant update on table "public"."t_conf_terminaciones" to "authenticated";

grant delete on table "public"."t_conf_terminaciones" to "postgres";

grant insert on table "public"."t_conf_terminaciones" to "postgres";

grant references on table "public"."t_conf_terminaciones" to "postgres";

grant select on table "public"."t_conf_terminaciones" to "postgres";

grant trigger on table "public"."t_conf_terminaciones" to "postgres";

grant truncate on table "public"."t_conf_terminaciones" to "postgres";

grant update on table "public"."t_conf_terminaciones" to "postgres";

grant delete on table "public"."t_conf_terminaciones" to "service_role";

grant insert on table "public"."t_conf_terminaciones" to "service_role";

grant references on table "public"."t_conf_terminaciones" to "service_role";

grant select on table "public"."t_conf_terminaciones" to "service_role";

grant trigger on table "public"."t_conf_terminaciones" to "service_role";

grant truncate on table "public"."t_conf_terminaciones" to "service_role";

grant update on table "public"."t_conf_terminaciones" to "service_role";

grant delete on table "public"."t_conf_tipos_entrega" to "anon";

grant insert on table "public"."t_conf_tipos_entrega" to "anon";

grant references on table "public"."t_conf_tipos_entrega" to "anon";

grant select on table "public"."t_conf_tipos_entrega" to "anon";

grant trigger on table "public"."t_conf_tipos_entrega" to "anon";

grant truncate on table "public"."t_conf_tipos_entrega" to "anon";

grant update on table "public"."t_conf_tipos_entrega" to "anon";

grant delete on table "public"."t_conf_tipos_entrega" to "authenticated";

grant insert on table "public"."t_conf_tipos_entrega" to "authenticated";

grant references on table "public"."t_conf_tipos_entrega" to "authenticated";

grant select on table "public"."t_conf_tipos_entrega" to "authenticated";

grant trigger on table "public"."t_conf_tipos_entrega" to "authenticated";

grant truncate on table "public"."t_conf_tipos_entrega" to "authenticated";

grant update on table "public"."t_conf_tipos_entrega" to "authenticated";

grant delete on table "public"."t_conf_tipos_entrega" to "postgres";

grant insert on table "public"."t_conf_tipos_entrega" to "postgres";

grant references on table "public"."t_conf_tipos_entrega" to "postgres";

grant select on table "public"."t_conf_tipos_entrega" to "postgres";

grant trigger on table "public"."t_conf_tipos_entrega" to "postgres";

grant truncate on table "public"."t_conf_tipos_entrega" to "postgres";

grant update on table "public"."t_conf_tipos_entrega" to "postgres";

grant delete on table "public"."t_conf_tipos_entrega" to "service_role";

grant insert on table "public"."t_conf_tipos_entrega" to "service_role";

grant references on table "public"."t_conf_tipos_entrega" to "service_role";

grant select on table "public"."t_conf_tipos_entrega" to "service_role";

grant trigger on table "public"."t_conf_tipos_entrega" to "service_role";

grant truncate on table "public"."t_conf_tipos_entrega" to "service_role";

grant update on table "public"."t_conf_tipos_entrega" to "service_role";

grant delete on table "public"."t_conf_tipos_gasto" to "anon";

grant insert on table "public"."t_conf_tipos_gasto" to "anon";

grant references on table "public"."t_conf_tipos_gasto" to "anon";

grant select on table "public"."t_conf_tipos_gasto" to "anon";

grant trigger on table "public"."t_conf_tipos_gasto" to "anon";

grant truncate on table "public"."t_conf_tipos_gasto" to "anon";

grant update on table "public"."t_conf_tipos_gasto" to "anon";

grant delete on table "public"."t_conf_tipos_gasto" to "authenticated";

grant insert on table "public"."t_conf_tipos_gasto" to "authenticated";

grant references on table "public"."t_conf_tipos_gasto" to "authenticated";

grant select on table "public"."t_conf_tipos_gasto" to "authenticated";

grant trigger on table "public"."t_conf_tipos_gasto" to "authenticated";

grant truncate on table "public"."t_conf_tipos_gasto" to "authenticated";

grant update on table "public"."t_conf_tipos_gasto" to "authenticated";

grant delete on table "public"."t_conf_tipos_gasto" to "postgres";

grant insert on table "public"."t_conf_tipos_gasto" to "postgres";

grant references on table "public"."t_conf_tipos_gasto" to "postgres";

grant select on table "public"."t_conf_tipos_gasto" to "postgres";

grant trigger on table "public"."t_conf_tipos_gasto" to "postgres";

grant truncate on table "public"."t_conf_tipos_gasto" to "postgres";

grant update on table "public"."t_conf_tipos_gasto" to "postgres";

grant delete on table "public"."t_conf_tipos_gasto" to "service_role";

grant insert on table "public"."t_conf_tipos_gasto" to "service_role";

grant references on table "public"."t_conf_tipos_gasto" to "service_role";

grant select on table "public"."t_conf_tipos_gasto" to "service_role";

grant trigger on table "public"."t_conf_tipos_gasto" to "service_role";

grant truncate on table "public"."t_conf_tipos_gasto" to "service_role";

grant update on table "public"."t_conf_tipos_gasto" to "service_role";

grant delete on table "public"."t_factura_compra_pagos" to "anon";

grant insert on table "public"."t_factura_compra_pagos" to "anon";

grant references on table "public"."t_factura_compra_pagos" to "anon";

grant select on table "public"."t_factura_compra_pagos" to "anon";

grant trigger on table "public"."t_factura_compra_pagos" to "anon";

grant truncate on table "public"."t_factura_compra_pagos" to "anon";

grant update on table "public"."t_factura_compra_pagos" to "anon";

grant delete on table "public"."t_factura_compra_pagos" to "authenticated";

grant insert on table "public"."t_factura_compra_pagos" to "authenticated";

grant references on table "public"."t_factura_compra_pagos" to "authenticated";

grant select on table "public"."t_factura_compra_pagos" to "authenticated";

grant trigger on table "public"."t_factura_compra_pagos" to "authenticated";

grant truncate on table "public"."t_factura_compra_pagos" to "authenticated";

grant update on table "public"."t_factura_compra_pagos" to "authenticated";

grant delete on table "public"."t_factura_compra_pagos" to "postgres";

grant insert on table "public"."t_factura_compra_pagos" to "postgres";

grant references on table "public"."t_factura_compra_pagos" to "postgres";

grant select on table "public"."t_factura_compra_pagos" to "postgres";

grant trigger on table "public"."t_factura_compra_pagos" to "postgres";

grant truncate on table "public"."t_factura_compra_pagos" to "postgres";

grant update on table "public"."t_factura_compra_pagos" to "postgres";

grant delete on table "public"."t_factura_compra_pagos" to "service_role";

grant insert on table "public"."t_factura_compra_pagos" to "service_role";

grant references on table "public"."t_factura_compra_pagos" to "service_role";

grant select on table "public"."t_factura_compra_pagos" to "service_role";

grant trigger on table "public"."t_factura_compra_pagos" to "service_role";

grant truncate on table "public"."t_factura_compra_pagos" to "service_role";

grant update on table "public"."t_factura_compra_pagos" to "service_role";

grant delete on table "public"."t_facturas_compra" to "anon";

grant insert on table "public"."t_facturas_compra" to "anon";

grant references on table "public"."t_facturas_compra" to "anon";

grant select on table "public"."t_facturas_compra" to "anon";

grant trigger on table "public"."t_facturas_compra" to "anon";

grant truncate on table "public"."t_facturas_compra" to "anon";

grant update on table "public"."t_facturas_compra" to "anon";

grant delete on table "public"."t_facturas_compra" to "authenticated";

grant insert on table "public"."t_facturas_compra" to "authenticated";

grant references on table "public"."t_facturas_compra" to "authenticated";

grant select on table "public"."t_facturas_compra" to "authenticated";

grant trigger on table "public"."t_facturas_compra" to "authenticated";

grant truncate on table "public"."t_facturas_compra" to "authenticated";

grant update on table "public"."t_facturas_compra" to "authenticated";

grant delete on table "public"."t_facturas_compra" to "postgres";

grant insert on table "public"."t_facturas_compra" to "postgres";

grant references on table "public"."t_facturas_compra" to "postgres";

grant select on table "public"."t_facturas_compra" to "postgres";

grant trigger on table "public"."t_facturas_compra" to "postgres";

grant truncate on table "public"."t_facturas_compra" to "postgres";

grant update on table "public"."t_facturas_compra" to "postgres";

grant delete on table "public"."t_facturas_compra" to "service_role";

grant insert on table "public"."t_facturas_compra" to "service_role";

grant references on table "public"."t_facturas_compra" to "service_role";

grant select on table "public"."t_facturas_compra" to "service_role";

grant trigger on table "public"."t_facturas_compra" to "service_role";

grant truncate on table "public"."t_facturas_compra" to "service_role";

grant update on table "public"."t_facturas_compra" to "service_role";

grant delete on table "public"."t_presupuesto_items_producto" to "anon";

grant insert on table "public"."t_presupuesto_items_producto" to "anon";

grant references on table "public"."t_presupuesto_items_producto" to "anon";

grant select on table "public"."t_presupuesto_items_producto" to "anon";

grant trigger on table "public"."t_presupuesto_items_producto" to "anon";

grant truncate on table "public"."t_presupuesto_items_producto" to "anon";

grant update on table "public"."t_presupuesto_items_producto" to "anon";

grant delete on table "public"."t_presupuesto_items_producto" to "authenticated";

grant insert on table "public"."t_presupuesto_items_producto" to "authenticated";

grant references on table "public"."t_presupuesto_items_producto" to "authenticated";

grant select on table "public"."t_presupuesto_items_producto" to "authenticated";

grant trigger on table "public"."t_presupuesto_items_producto" to "authenticated";

grant truncate on table "public"."t_presupuesto_items_producto" to "authenticated";

grant update on table "public"."t_presupuesto_items_producto" to "authenticated";

grant delete on table "public"."t_presupuesto_items_producto" to "postgres";

grant insert on table "public"."t_presupuesto_items_producto" to "postgres";

grant references on table "public"."t_presupuesto_items_producto" to "postgres";

grant select on table "public"."t_presupuesto_items_producto" to "postgres";

grant trigger on table "public"."t_presupuesto_items_producto" to "postgres";

grant truncate on table "public"."t_presupuesto_items_producto" to "postgres";

grant update on table "public"."t_presupuesto_items_producto" to "postgres";

grant delete on table "public"."t_presupuesto_items_producto" to "service_role";

grant insert on table "public"."t_presupuesto_items_producto" to "service_role";

grant references on table "public"."t_presupuesto_items_producto" to "service_role";

grant select on table "public"."t_presupuesto_items_producto" to "service_role";

grant trigger on table "public"."t_presupuesto_items_producto" to "service_role";

grant truncate on table "public"."t_presupuesto_items_producto" to "service_role";

grant update on table "public"."t_presupuesto_items_producto" to "service_role";

grant delete on table "public"."t_presupuesto_items_trabajo" to "anon";

grant insert on table "public"."t_presupuesto_items_trabajo" to "anon";

grant references on table "public"."t_presupuesto_items_trabajo" to "anon";

grant select on table "public"."t_presupuesto_items_trabajo" to "anon";

grant trigger on table "public"."t_presupuesto_items_trabajo" to "anon";

grant truncate on table "public"."t_presupuesto_items_trabajo" to "anon";

grant update on table "public"."t_presupuesto_items_trabajo" to "anon";

grant delete on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant insert on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant references on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant select on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant trigger on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant truncate on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant update on table "public"."t_presupuesto_items_trabajo" to "authenticated";

grant delete on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant insert on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant references on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant select on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant trigger on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant truncate on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant update on table "public"."t_presupuesto_items_trabajo" to "postgres";

grant delete on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant insert on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant references on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant select on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant trigger on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant truncate on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant update on table "public"."t_presupuesto_items_trabajo" to "service_role";

grant delete on table "public"."t_presupuestos" to "anon";

grant insert on table "public"."t_presupuestos" to "anon";

grant references on table "public"."t_presupuestos" to "anon";

grant select on table "public"."t_presupuestos" to "anon";

grant trigger on table "public"."t_presupuestos" to "anon";

grant truncate on table "public"."t_presupuestos" to "anon";

grant update on table "public"."t_presupuestos" to "anon";

grant delete on table "public"."t_presupuestos" to "authenticated";

grant insert on table "public"."t_presupuestos" to "authenticated";

grant references on table "public"."t_presupuestos" to "authenticated";

grant select on table "public"."t_presupuestos" to "authenticated";

grant trigger on table "public"."t_presupuestos" to "authenticated";

grant truncate on table "public"."t_presupuestos" to "authenticated";

grant update on table "public"."t_presupuestos" to "authenticated";

grant delete on table "public"."t_presupuestos" to "postgres";

grant insert on table "public"."t_presupuestos" to "postgres";

grant references on table "public"."t_presupuestos" to "postgres";

grant select on table "public"."t_presupuestos" to "postgres";

grant trigger on table "public"."t_presupuestos" to "postgres";

grant truncate on table "public"."t_presupuestos" to "postgres";

grant update on table "public"."t_presupuestos" to "postgres";

grant delete on table "public"."t_presupuestos" to "service_role";

grant insert on table "public"."t_presupuestos" to "service_role";

grant references on table "public"."t_presupuestos" to "service_role";

grant select on table "public"."t_presupuestos" to "service_role";

grant trigger on table "public"."t_presupuestos" to "service_role";

grant truncate on table "public"."t_presupuestos" to "service_role";

grant update on table "public"."t_presupuestos" to "service_role";

grant delete on table "public"."t_productos" to "anon";

grant insert on table "public"."t_productos" to "anon";

grant references on table "public"."t_productos" to "anon";

grant select on table "public"."t_productos" to "anon";

grant trigger on table "public"."t_productos" to "anon";

grant truncate on table "public"."t_productos" to "anon";

grant update on table "public"."t_productos" to "anon";

grant delete on table "public"."t_productos" to "authenticated";

grant insert on table "public"."t_productos" to "authenticated";

grant references on table "public"."t_productos" to "authenticated";

grant select on table "public"."t_productos" to "authenticated";

grant trigger on table "public"."t_productos" to "authenticated";

grant truncate on table "public"."t_productos" to "authenticated";

grant update on table "public"."t_productos" to "authenticated";

grant delete on table "public"."t_productos" to "postgres";

grant insert on table "public"."t_productos" to "postgres";

grant references on table "public"."t_productos" to "postgres";

grant select on table "public"."t_productos" to "postgres";

grant trigger on table "public"."t_productos" to "postgres";

grant truncate on table "public"."t_productos" to "postgres";

grant update on table "public"."t_productos" to "postgres";

grant delete on table "public"."t_productos" to "service_role";

grant insert on table "public"."t_productos" to "service_role";

grant references on table "public"."t_productos" to "service_role";

grant select on table "public"."t_productos" to "service_role";

grant trigger on table "public"."t_productos" to "service_role";

grant truncate on table "public"."t_productos" to "service_role";

grant update on table "public"."t_productos" to "service_role";

grant delete on table "public"."t_proveedores" to "anon";

grant insert on table "public"."t_proveedores" to "anon";

grant references on table "public"."t_proveedores" to "anon";

grant select on table "public"."t_proveedores" to "anon";

grant trigger on table "public"."t_proveedores" to "anon";

grant truncate on table "public"."t_proveedores" to "anon";

grant update on table "public"."t_proveedores" to "anon";

grant delete on table "public"."t_proveedores" to "authenticated";

grant insert on table "public"."t_proveedores" to "authenticated";

grant references on table "public"."t_proveedores" to "authenticated";

grant select on table "public"."t_proveedores" to "authenticated";

grant trigger on table "public"."t_proveedores" to "authenticated";

grant truncate on table "public"."t_proveedores" to "authenticated";

grant update on table "public"."t_proveedores" to "authenticated";

grant delete on table "public"."t_proveedores" to "postgres";

grant insert on table "public"."t_proveedores" to "postgres";

grant references on table "public"."t_proveedores" to "postgres";

grant select on table "public"."t_proveedores" to "postgres";

grant trigger on table "public"."t_proveedores" to "postgres";

grant truncate on table "public"."t_proveedores" to "postgres";

grant update on table "public"."t_proveedores" to "postgres";

grant delete on table "public"."t_proveedores" to "service_role";

grant insert on table "public"."t_proveedores" to "service_role";

grant references on table "public"."t_proveedores" to "service_role";

grant select on table "public"."t_proveedores" to "service_role";

grant trigger on table "public"."t_proveedores" to "service_role";

grant truncate on table "public"."t_proveedores" to "service_role";

grant update on table "public"."t_proveedores" to "service_role";

grant delete on table "public"."t_recibo_facturas" to "anon";

grant insert on table "public"."t_recibo_facturas" to "anon";

grant references on table "public"."t_recibo_facturas" to "anon";

grant select on table "public"."t_recibo_facturas" to "anon";

grant trigger on table "public"."t_recibo_facturas" to "anon";

grant truncate on table "public"."t_recibo_facturas" to "anon";

grant update on table "public"."t_recibo_facturas" to "anon";

grant delete on table "public"."t_recibo_facturas" to "authenticated";

grant insert on table "public"."t_recibo_facturas" to "authenticated";

grant references on table "public"."t_recibo_facturas" to "authenticated";

grant select on table "public"."t_recibo_facturas" to "authenticated";

grant trigger on table "public"."t_recibo_facturas" to "authenticated";

grant truncate on table "public"."t_recibo_facturas" to "authenticated";

grant update on table "public"."t_recibo_facturas" to "authenticated";

grant delete on table "public"."t_recibo_facturas" to "postgres";

grant insert on table "public"."t_recibo_facturas" to "postgres";

grant references on table "public"."t_recibo_facturas" to "postgres";

grant select on table "public"."t_recibo_facturas" to "postgres";

grant trigger on table "public"."t_recibo_facturas" to "postgres";

grant truncate on table "public"."t_recibo_facturas" to "postgres";

grant update on table "public"."t_recibo_facturas" to "postgres";

grant delete on table "public"."t_recibo_facturas" to "service_role";

grant insert on table "public"."t_recibo_facturas" to "service_role";

grant references on table "public"."t_recibo_facturas" to "service_role";

grant select on table "public"."t_recibo_facturas" to "service_role";

grant trigger on table "public"."t_recibo_facturas" to "service_role";

grant truncate on table "public"."t_recibo_facturas" to "service_role";

grant update on table "public"."t_recibo_facturas" to "service_role";

grant delete on table "public"."t_recibo_items" to "anon";

grant insert on table "public"."t_recibo_items" to "anon";

grant references on table "public"."t_recibo_items" to "anon";

grant select on table "public"."t_recibo_items" to "anon";

grant trigger on table "public"."t_recibo_items" to "anon";

grant truncate on table "public"."t_recibo_items" to "anon";

grant update on table "public"."t_recibo_items" to "anon";

grant delete on table "public"."t_recibo_items" to "authenticated";

grant insert on table "public"."t_recibo_items" to "authenticated";

grant references on table "public"."t_recibo_items" to "authenticated";

grant select on table "public"."t_recibo_items" to "authenticated";

grant trigger on table "public"."t_recibo_items" to "authenticated";

grant truncate on table "public"."t_recibo_items" to "authenticated";

grant update on table "public"."t_recibo_items" to "authenticated";

grant delete on table "public"."t_recibo_items" to "postgres";

grant insert on table "public"."t_recibo_items" to "postgres";

grant references on table "public"."t_recibo_items" to "postgres";

grant select on table "public"."t_recibo_items" to "postgres";

grant trigger on table "public"."t_recibo_items" to "postgres";

grant truncate on table "public"."t_recibo_items" to "postgres";

grant update on table "public"."t_recibo_items" to "postgres";

grant delete on table "public"."t_recibo_items" to "service_role";

grant insert on table "public"."t_recibo_items" to "service_role";

grant references on table "public"."t_recibo_items" to "service_role";

grant select on table "public"."t_recibo_items" to "service_role";

grant trigger on table "public"."t_recibo_items" to "service_role";

grant truncate on table "public"."t_recibo_items" to "service_role";

grant update on table "public"."t_recibo_items" to "service_role";

grant delete on table "public"."t_recibos" to "anon";

grant insert on table "public"."t_recibos" to "anon";

grant references on table "public"."t_recibos" to "anon";

grant select on table "public"."t_recibos" to "anon";

grant trigger on table "public"."t_recibos" to "anon";

grant truncate on table "public"."t_recibos" to "anon";

grant update on table "public"."t_recibos" to "anon";

grant delete on table "public"."t_recibos" to "authenticated";

grant insert on table "public"."t_recibos" to "authenticated";

grant references on table "public"."t_recibos" to "authenticated";

grant select on table "public"."t_recibos" to "authenticated";

grant trigger on table "public"."t_recibos" to "authenticated";

grant truncate on table "public"."t_recibos" to "authenticated";

grant update on table "public"."t_recibos" to "authenticated";

grant delete on table "public"."t_recibos" to "postgres";

grant insert on table "public"."t_recibos" to "postgres";

grant references on table "public"."t_recibos" to "postgres";

grant select on table "public"."t_recibos" to "postgres";

grant trigger on table "public"."t_recibos" to "postgres";

grant truncate on table "public"."t_recibos" to "postgres";

grant update on table "public"."t_recibos" to "postgres";

grant delete on table "public"."t_recibos" to "service_role";

grant insert on table "public"."t_recibos" to "service_role";

grant references on table "public"."t_recibos" to "service_role";

grant select on table "public"."t_recibos" to "service_role";

grant trigger on table "public"."t_recibos" to "service_role";

grant truncate on table "public"."t_recibos" to "service_role";

grant update on table "public"."t_recibos" to "service_role";

grant delete on table "public"."t_roles" to "anon";

grant insert on table "public"."t_roles" to "anon";

grant references on table "public"."t_roles" to "anon";

grant select on table "public"."t_roles" to "anon";

grant trigger on table "public"."t_roles" to "anon";

grant truncate on table "public"."t_roles" to "anon";

grant update on table "public"."t_roles" to "anon";

grant delete on table "public"."t_roles" to "authenticated";

grant insert on table "public"."t_roles" to "authenticated";

grant references on table "public"."t_roles" to "authenticated";

grant select on table "public"."t_roles" to "authenticated";

grant trigger on table "public"."t_roles" to "authenticated";

grant truncate on table "public"."t_roles" to "authenticated";

grant update on table "public"."t_roles" to "authenticated";

grant delete on table "public"."t_roles" to "postgres";

grant insert on table "public"."t_roles" to "postgres";

grant references on table "public"."t_roles" to "postgres";

grant select on table "public"."t_roles" to "postgres";

grant trigger on table "public"."t_roles" to "postgres";

grant truncate on table "public"."t_roles" to "postgres";

grant update on table "public"."t_roles" to "postgres";

grant delete on table "public"."t_roles" to "service_role";

grant insert on table "public"."t_roles" to "service_role";

grant references on table "public"."t_roles" to "service_role";

grant select on table "public"."t_roles" to "service_role";

grant trigger on table "public"."t_roles" to "service_role";

grant truncate on table "public"."t_roles" to "service_role";

grant update on table "public"."t_roles" to "service_role";

grant delete on table "public"."t_trabajos" to "anon";

grant insert on table "public"."t_trabajos" to "anon";

grant references on table "public"."t_trabajos" to "anon";

grant select on table "public"."t_trabajos" to "anon";

grant trigger on table "public"."t_trabajos" to "anon";

grant truncate on table "public"."t_trabajos" to "anon";

grant update on table "public"."t_trabajos" to "anon";

grant delete on table "public"."t_trabajos" to "authenticated";

grant insert on table "public"."t_trabajos" to "authenticated";

grant references on table "public"."t_trabajos" to "authenticated";

grant select on table "public"."t_trabajos" to "authenticated";

grant trigger on table "public"."t_trabajos" to "authenticated";

grant truncate on table "public"."t_trabajos" to "authenticated";

grant update on table "public"."t_trabajos" to "authenticated";

grant delete on table "public"."t_trabajos" to "postgres";

grant insert on table "public"."t_trabajos" to "postgres";

grant references on table "public"."t_trabajos" to "postgres";

grant select on table "public"."t_trabajos" to "postgres";

grant trigger on table "public"."t_trabajos" to "postgres";

grant truncate on table "public"."t_trabajos" to "postgres";

grant update on table "public"."t_trabajos" to "postgres";

grant delete on table "public"."t_trabajos" to "service_role";

grant insert on table "public"."t_trabajos" to "service_role";

grant references on table "public"."t_trabajos" to "service_role";

grant select on table "public"."t_trabajos" to "service_role";

grant trigger on table "public"."t_trabajos" to "service_role";

grant truncate on table "public"."t_trabajos" to "service_role";

grant update on table "public"."t_trabajos" to "service_role";

grant delete on table "public"."t_usuarios" to "anon";

grant insert on table "public"."t_usuarios" to "anon";

grant references on table "public"."t_usuarios" to "anon";

grant select on table "public"."t_usuarios" to "anon";

grant trigger on table "public"."t_usuarios" to "anon";

grant truncate on table "public"."t_usuarios" to "anon";

grant update on table "public"."t_usuarios" to "anon";

grant delete on table "public"."t_usuarios" to "authenticated";

grant insert on table "public"."t_usuarios" to "authenticated";

grant references on table "public"."t_usuarios" to "authenticated";

grant select on table "public"."t_usuarios" to "authenticated";

grant trigger on table "public"."t_usuarios" to "authenticated";

grant truncate on table "public"."t_usuarios" to "authenticated";

grant update on table "public"."t_usuarios" to "authenticated";

grant delete on table "public"."t_usuarios" to "postgres";

grant insert on table "public"."t_usuarios" to "postgres";

grant references on table "public"."t_usuarios" to "postgres";

grant select on table "public"."t_usuarios" to "postgres";

grant trigger on table "public"."t_usuarios" to "postgres";

grant truncate on table "public"."t_usuarios" to "postgres";

grant update on table "public"."t_usuarios" to "postgres";

grant delete on table "public"."t_usuarios" to "service_role";

grant insert on table "public"."t_usuarios" to "service_role";

grant references on table "public"."t_usuarios" to "service_role";

grant select on table "public"."t_usuarios" to "service_role";

grant trigger on table "public"."t_usuarios" to "service_role";

grant truncate on table "public"."t_usuarios" to "service_role";

grant update on table "public"."t_usuarios" to "service_role";


  create policy "Usuarios autenticados pueden leer clientes"
  on "public"."t_clientes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Usuarios autenticados pueden modificar clientes"
  on "public"."t_clientes"
  as permissive
  for all
  to authenticated
using (true);



  create policy "p_auth_all"
  on "public"."t_comprobantes"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "p_auth_all"
  on "public"."t_facturas_compra"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "p_auth_all"
  on "public"."t_presupuestos"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "p_auth_all"
  on "public"."t_recibos"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "p_auth_all"
  on "public"."t_trabajos"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "p_auth_all"
  on "public"."t_usuarios"
  as permissive
  for all
  to authenticated
using (true)
with check (true);


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


