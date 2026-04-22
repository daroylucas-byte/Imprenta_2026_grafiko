-- Seed data for GestiPrint

-- 1. Roles (Critical for registration)
INSERT INTO public.t_roles (id, nombre, permisos) VALUES
('f0360270-5058-4bd8-8e26-e4ffa3ac8141', 'Administrador', 'Todos los permisos'),
(extensions.uuid_generate_v4(), 'Operador', 'Gestión de trabajos y clientes')
ON CONFLICT (id) DO NOTHING;

-- 2. Sistemas de Impresión
INSERT INTO public.t_conf_sistemas_impresion (nombre) VALUES
('Offset'),
('Digital'),
('Serigrafía'),
('Plotter'),
('Tipografía')
ON CONFLICT DO NOTHING;

-- 3. Tamaños de Papel
INSERT INTO public.t_conf_tamanios_papel (nombre) VALUES
('A4'),
('A3'),
('A3+'),
('Oficio'),
('Carta'),
('10x15cm'),
('Otro')
ON CONFLICT DO NOTHING;

-- 4. Soportes
INSERT INTO public.t_conf_soportes (nombre) VALUES
('Obra 70g'),
('Obra 80g'),
('Obra 90g'),
('Ilustración 150g Brillante'),
('Ilustración 300g Mate'),
('Autoadhesivo'),
('Químico (Duplicados)')
ON CONFLICT DO NOTHING;

-- 5. Cantidad de Copias (para talonarios)
INSERT INTO public.t_conf_cant_copias (nombre) VALUES
('Original'),
('Duplicado'),
('Triplicado')
ON CONFLICT DO NOTHING;

-- 6. Tipos de Entrega
INSERT INTO public.t_conf_tipos_entrega (nombre) VALUES
('Retiro en Mostrador'),
('Envío Moto'),
('Envío Logística'),
('Urgente')
ON CONFLICT DO NOTHING;

-- 7. Acabados
INSERT INTO public.t_conf_acabados (nombre) VALUES
('Sin Acabado'),
('Laminado Mate'),
('Laminado Brillante'),
('Barniz UV'),
('Troquelado')
ON CONFLICT DO NOTHING;

-- 8. Terminaciones
INSERT INTO public.t_conf_terminaciones (nombre) VALUES
('Corte Recto'),
('Abrochado'),
('Encolado'),
('Anillado'),
('Plegado')
ON CONFLICT DO NOTHING;

-- 9. Tipos de Gasto
INSERT INTO public.t_conf_tipos_gasto (nombre) VALUES
('Insumos'),
('Servicios'),
('Alquiler'),
('Sueldos'),
('Mantenimiento'),
('Otros')
ON CONFLICT DO NOTHING;

-- 10. Clientes (Sample Data)
INSERT INTO public.t_clientes (razon_social, cuit, nombre_fantasia, email, direccion, localidad) VALUES
('Editorial Horizonte', '30-12345678-9', 'Horizonte Editores', 'contacto@horizonte.com', 'Av. Corrientes 1234', 'CABA'),
('Gráfica del Sur', '30-98765432-1', 'Sur Gráfica', 'info@sur.com.ar', 'Calle 50 nro 789', 'La Plata')
ON CONFLICT DO NOTHING;

-- 11. Productos (Sample Data)
INSERT INTO public.t_productos (nombre, descripcion, precio_costo, precio_minorista, precio_mayorista, categoria, requiere_numeracion, requiere_fecha_muestra) VALUES
('Tarjetas de Presentación', 'Tarjetas 9x5cm en cartulina 300g', 1500.00, 5500.00, 4500.00, 'Imprenta', false, false),
('Folletos A5', 'Flyers 15x21cm en obra 90g x 1000u', 4500.00, 12500.00, 10500.00, 'Folletería', false, false),
('Talonario Factura A', 'Talonario duplicado 17x22cm', 2500.00, 8500.00, 7200.00, 'Imprenta', true, true)
ON CONFLICT DO NOTHING;
