# Grafiko — Sistema de Gestión de Imprenta

## Identidad

- **Proyecto**: Grafiko (nombre visible en UI: "GRAFIKO" / título de fallback "GestiPrint")
- **Para quién**: negocio propio del usuario (imprenta), no un cliente externo
- **Tipo**: comercio / pyme, single-tenant (un solo local/negocio, sin multi-sucursal)
- **Supabase project ref**: `eoznwxfflcmpivnwafwd` (región us-east-1, Postgres 17)
- **Estado**: en desarrollo/pruebas (deploy en Vercel existe, pero la base de Supabase todavía tiene datos de testing, no es producción real todavía — confirmado por el usuario el 2026-07-07)

## Stack técnico

- React 19.2 + TypeScript + Vite 8
- Supabase JS v2 (`@supabase/supabase-js` ^2.103.2)
- React Router v7, Zustand (auth store), React Hook Form, React Query, react-hot-toast
- Tailwind CSS v4, Recharts/Chart.js para gráficos
- jsPDF + jspdf-autotable para generación de PDFs (recibos, cuentas corrientes)
- Lucide React + Material Symbols para iconografía

## Estructura de carpetas

```
src/
  pages/          — una página por ruta (DashboardPage, KanbanPage, ClientsPage, BillingPage, ProductsPage, ConfigDropdownPage, CashRegisterPage)
  components/     — modales y piezas reutilizables (ClientModal, ClientLedgerModal, PaymentModal, AdjustmentModal, JobModal, BillingModal, Layout)
  store/          — Zustand (authStore.ts)
  lib/            — cliente Supabase (supabase.ts)
  utils/          — helpers (printJob.ts)
supabase/
  migrations/     — migraciones SQL versionadas (única fuente de verdad del schema)
```

**Desviación conocida respecto a buenas prácticas**: no existe carpeta `services/`. Los componentes llaman a `supabase` directamente (import de `lib/supabase.ts`). Si se refactoriza esto en el futuro, hacerlo de forma incremental, no como bloqueo de otras tareas.

## Rutas principales

- `/` — Dashboard
- `/comercial` — Kanban de trabajos (producción)
- `/clientes` — Gestión de clientes + cuenta corriente
- `/productos` — Catálogo de productos
- `/facturacion` — Comprobantes (`t_comprobantes`)
- `/configuracion` — Configuración del sistema
- `/caja` — Caja registradora (apertura/cierre, arqueo, movimientos)

## Base de datos (schema real, no genérico)

El modelo **no** usa nombres genéricos tipo `ventas`/`pagos`/`caja_sesiones`. Usa:

- `t_clientes` — clientes, con `situacion_iva`, `es_mayorista`
- `t_trabajos` — el equivalente a "venta"/orden de trabajo. Tiene `estado`, `total`, `fecha_aprobacion`, muchos campos técnicos de imprenta (acabados, soportes, tamaños, película, etc.)
- `t_trabajo_productos` — ítems de producto por trabajo
- `t_comprobantes` — facturación (tipo, número, total, `estado` enum `t_estado_comprobante`)
- `t_comprobante_items`, `t_comprobante_trabajos`, `t_comprobante_cobros`
- `t_recibos` — recibos de cobro a cuenta corriente (no ligados a un trabajo específico)
- `t_recibo_items`, `t_recibo_trabajos` (aplicación FIFO de recibos contra trabajos), `t_recibo_facturas`
- `t_pagos_trabajo` — pagos directos imputados a un trabajo puntual
- `t_ajustes_cc` — **(nuevo, 2026-07-06)** notas de crédito/débito manuales sobre cuenta corriente. Enum `t_tipo_ajuste_cc` (`credito`/`debito`), monto siempre positivo.
- `t_aperturas_caja` — apertura/cierre de caja (`fecha_apertura`, `fecha_cierre`, `saldo_inicio`, `saldo_cierre`). Sin UI todavía (ver Estado del plan).
- `t_movimientos_caja` — **(nuevo, 2026-07-07)** ingresos/egresos de una caja abierta. Enum `t_tipo_movimiento_caja` (`ingreso`/`egreso`). FK a `t_aperturas_caja`, opcional a `t_recibos`/`t_pagos_trabajo`. Sin `cliente_id` directo (se obtiene vía `recibo_id`).
- `t_usuarios`, `t_roles` (roles existentes: **Administrador** = todos los permisos, **Operador** = gestión de trabajos y clientes)
- `t_proveedores`
- Tablas de configuración: `t_conf_acabados`, `t_conf_cant_copias`, `t_conf_peliculados`, `t_conf_sistemas_impresion`, `t_conf_soportes`, `t_conf_tamanios_papel`, `t_conf_terminaciones`, `t_conf_tipos_entrega`, `t_conf_tipos_gasto`

**Vista clave**: `v_saldo_clientes` — calcula `total_deuda`, `total_cobrado`, `total_ajustes_credito`, `total_ajustes_debito`, `saldo_pendiente` y `credito_disponible` por cliente, cruzando trabajos aprobados, comprobantes sueltos, pagos directos, recibos aplicados y ajustes manuales. Es la fuente de verdad del saldo — no recalcular esto a mano en el frontend.

**Vista**: `v_saldo_trabajos` — saldo pendiente por trabajo individual, usada para la imputación FIFO.

**Vistas de caja (nuevas, 2026-07-07)**: `v_caja_abierta` (la apertura de caja actual sin cerrar, o vacío) y `v_saldo_caja_actual` (saldo_inicio + ingresos - egresos de la caja abierta).

**RPC clave (nueva, 2026-07-07)**: `registrar_cobro_con_fifo(p_cliente_id, p_monto, p_metodo, p_fecha, p_observaciones, p_usuario_id)` — hace todo el flujo de cobro en una transacción atómica: crea el recibo (`t_recibos`+`t_recibo_items`), imputa FIFO contra trabajos pendientes del cliente (más antiguos primero, vía `v_saldo_trabajos`), y si hay una caja abierta registra el ingreso en `t_movimientos_caja`. Devuelve `recibo_id`, `monto_aplicado_fifo`, `monto_no_aplicado`, `movimiento_caja_id`. **El frontend debe llamar a este RPC en vez de replicar la lógica FIFO/caja en JS.**

RLS: todas las tablas `t_*` tienen policy `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — control de acceso binario (autenticado sí/no), sin distinción real de roles todavía a nivel de RLS.

## Convenciones de código observadas

- Componentes funcionales con `React.FC`, hooks `useState`/`useEffect`/`useCallback`.
- Modales como componentes separados en `components/`, montados condicionalmente desde la página (`isXOpen && <XModal onClose={...} onSuccess={refetch} />`).
- Toasts con `react-hot-toast` para éxito/error en cada operación contra Supabase.
- Formularios con `react-hook-form` (`register`, `handleSubmit`, `formState.errors`).
- Estilo visual: Tailwind con clases largas, `rounded-[2rem]`/`rounded-[2.5rem]`, paleta `primary`/`error`/`emerald`/`indigo` con variantes `/10`, `/20` de opacidad, tipografía `font-headline font-extrabold`, labels en `text-[10px] font-black uppercase tracking-widest`.
- Íconos: `<span className="material-symbols-outlined">`.
- Montos: `Number(x).toLocaleString('es-AR', { minimumFractionDigits: 2 })`.
- Migraciones SQL versionadas en `supabase/migrations/` con timestamp `YYYYMMDDHHMMSS_descripcion.sql`; se aplican directo contra el proyecto remoto vía MCP de Supabase (no hay entorno local de Supabase corriendo en paralelo).

## Variables de entorno

No hay `.env.example` en el repo. Confirmado que existe `.env` local (no versionado). Variables esperadas según `lib/supabase.ts`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Regla fija: nunca poner `service_role_key`, tokens de API ni certificados en variables `VITE_*` — esas van al bundle público del cliente.

## Estado del plan en curso (cuenta corriente / pagos / facturación ARCA / promos IA)

Se definió un plan de 4 fases a partir de un prompt de referencia (ERP genérico), **adaptado al schema real** en vez de migrar a tablas genéricas:

- **Fase 1 — Cuenta corriente y pagos** (prioridad actual)
  - ✅ **1.1 Ajustes de saldo (notas de crédito/débito)** — hecho 2026-07-06. Tabla `t_ajustes_cc`, vista `v_saldo_clientes` actualizada, `AdjustmentModal.tsx`, integrado en `ClientLedgerModal.tsx` (botón "Ajustar Saldo" + historial). Migración: `supabase/migrations/20260706171706_ajustes_cuenta_corriente.sql`.
  - ✅ **1.2/1.3 backend (DB + lógica) — FIFO automático + impacto en caja** — hecho 2026-07-07. Migración `supabase/migrations/20260707091836_caja_y_cobro_fifo.sql`: tabla `t_movimientos_caja`, vistas `v_caja_abierta`/`v_saldo_caja_actual`, RPC `registrar_cobro_con_fifo` (ver arriba). Aplicada y verificada en Supabase.
  - ✅ **1.2/1.3 frontend** — hecho 2026-07-07 (por Gemini, revisado y verificado por Claude). `PaymentModal.tsx` llama al RPC `registrar_cobro_con_fifo` (ya no inserta directo). Botón de `ClientLedgerModal.tsx` renombrado a "Aplicar crédito disponible a deuda" con texto de ayuda, para reconciliación manual de créditos viejos. Página nueva `src/pages/CashRegisterPage.tsx` en la ruta `/caja` (agregada al menú de `Layout.tsx`): apertura/cierre de caja con arqueo y diferencia, listado de movimientos, egresos manuales. `tsc --noEmit` sin errores.
  - **1.4** ya cubierto por 1.1 (la vista ya incluye ajustes).
  - **Fase 1 completa.**
- **Fase 2 — Consistencia de `t_comprobantes`/`BillingPage`** — ✅ hecho 2026-07-07. Migración `supabase/migrations/20260707094936_estado_comprobantes_derivado.sql`: vista `v_estado_comprobantes` (campos `comprobante_id`, `estado_guardado`, `trabajo_id`, `estado_real`, `total_cobrado_real`, `saldo_pendiente_real`). Si el comprobante está vinculado a un trabajo usa `v_saldo_trabajos.saldo_pendiente` de ese trabajo; si no, usa `t_comprobante_cobros` vs `total`; siempre respeta `anulado` guardado manualmente. `BillingPage.tsx` (`getStatus`, cálculo de `pendingTotal`) ahora lee de esta vista. `BillingModal.tsx` muestra el estado como solo lectura (con nota) cuando el comprobante tiene trabajo vinculado, y deja el select editable solo para comprobantes sueltos. Verificado con `tsc --noEmit` y `npm run build` (ambos limpios).
- **Nota sobre la seña (`t_trabajos.sena`)**: al crear un trabajo con seña, `JobModal.tsx` inserta automáticamente un `t_pagos_trabajo` (correcto, sí resta de `v_saldo_trabajos`). Pero al facturar ese trabajo, `BillingModal.tsx` vuelve a insertar la misma seña en `t_comprobante_cobros` (tabla que no afecta `v_saldo_trabajos`) — es un registro informativo duplicado, no afecta el saldo real pero sí infla cualquier reporte futuro que sume `t_comprobante_cobros` + `t_pagos_trabajo` sin cuidado. Pendiente de decidir si vale la pena arreglarlo.
- **Reset de datos de prueba (2026-07-07)**: el usuario confirmó que el sistema **no está en producción real todavía** (solo datos de testing). Se vació con `TRUNCATE ... RESTART IDENTITY CASCADE`: `t_trabajos`, `t_trabajo_productos`, `t_comprobantes` y sus tablas hijas, `t_recibos` y sus hijas, `t_pagos_trabajo`, `t_ajustes_cc`, `t_aperturas_caja`, `t_movimientos_caja`. Se mantuvieron intactos `t_clientes` (4 filas) y `t_productos` (6 filas). Motivo: se había detectado un caso donde un trabajo de $150.000 con saldo ya saldado no aparecía en el historial del `ClientLedgerModal` — no se llegó a confirmar si era bug de código o dato corrupto, porque se decidió limpiar en vez de seguir depurando sobre datos de prueba. **Si el problema reaparece con datos nuevos, tratarlo como bug real de `ClientLedgerModal.tsx` (la query de "approved jobs" con filtro `estado not.in (CANCELADO,ANULADO)`).**
- **Fase 3 — Facturación ARCA/AFIP** — pendiente, deliberadamente para el final (requiere VPS propio + certificados AFIP reales).
- **Fase 4 — Promociones IA con wallet de créditos** — ✅ texto hecho 2026-07-07, ✅ imágenes (identidad visual + flyer) hecho 2026-07-07. Decisiones tomadas: proveedor Gemini (no Claude/OpenAI), carga de saldo manual desde UI (sin integración de pago real). Sin concepto de `local_id` (single-tenant, a diferencia del prompt original de referencia). Alcance de imágenes: solo flyer simple por ahora (sin pack de feed ni carrusel — se suman después si se valida el flujo).
  - **Modelo de imagen**: `gemini-3.1-flash-image` ("Nano Banana 2"), confirmado con prueba real (`curl`/`Invoke-RestMethod` contra la API) que soporta tanto lectura de imágenes (input multimodal, para analizar identidad) como generación (output en `candidates[0].content.parts[].inlineData.{mimeType,data}`, base64). **Importante para el futuro**: la cuenta de Gemini del usuario tiene modelos mucho más nuevos que el conocimiento de entrenamiento de Claude (llegaba hasta Gemini 3.5 en la lista de `GET /v1beta/models`) — ante cualquier 404 "model not found", correr ese endpoint de listado en vez de adivinar el nombre.
  - **Backend imágenes**: migración `supabase/migrations/20260707102436_identidad_visual_e_imagenes.sql`: tablas `t_identidad_visual` (imágenes de referencia subidas por el usuario), `t_analisis_identidad` (singleton, resultado del análisis de estilo), columna `t_promociones.imagen_url`; se amplió el `CHECK` de `t_transacciones_marketing.tipo` para incluir `analizar_identidad` y `generar_imagen`. Bucket de Storage público `marketing` creado directo vía SQL (`INSERT INTO storage.buckets`, no hay tool de MCP dedicada) con policies: lectura pública, escritura solo `authenticated`.
  - **Edge Functions nuevas**: `analizar-identidad` (`supabase/functions/analizar-identidad/index.ts`) — descarga hasta 5 imágenes de `t_identidad_visual`, descuenta 500 créditos, las manda a Gemini multimodal, guarda `estilo_descripcion` en `t_analisis_identidad`. `generar-imagen` (`supabase/functions/generar-imagen/index.ts`) — recibe `promocion_id`, combina título/descripción/CTA de la promoción con el estilo analizado, descuenta 1250 créditos, genera la imagen, la sube al bucket `marketing`, guarda la URL en `t_promociones.imagen_url`. Ambas desplegadas y `ACTIVE` (`verify_jwt: true`), mismo patrón de `corsHeaders`/manejo de `OPTIONS` que `generar-promos`.
  - **Frontend** (por Gemini, revisado por Claude): `PromotionsPage.tsx` extendido con sección "Identidad Visual" (subida a `t_identidad_visual` + bucket `marketing/identidad/`, grid de thumbnails, botón "Analizar Identidad (500)") y botón "Generar Flyer (1250)"/"Regenerar Flyer" en cada card de promoción, con preview de imagen + links "Ver"/"Bajar". Funciona end-to-end, verificado en la app real.
  - **Fixes de calidad del prompt de imagen (2026-07-07, `generar-imagen` `version: 3`)**: (1) el primer flyer generado salió con tema genérico (mundial de fútbol sin relación a la marca) porque `t_analisis_identidad` estaba vacía — nunca se había ejecutado `analizar-identidad` (0 llamadas en los logs) y la única imagen subida era una captura de pantalla, no material real. Al subir material real (logo, flyer viejo) y correr el análisis, quedó guardado un `estilo_descripcion` correcto (paleta amarillo/naranja/violeta/rojo, tipografía Impact/Arial Black, isotipo de la "g"). (2) Aun con el análisis bien guardado, el primer flyer con esos datos no reflejaba bien el estilo — se reforzó el prompt: la identidad visual ahora va como bloque de "REGLAS DE IDENTIDAD VISUAL... obligatorias, prioridad #1" al principio del prompt (no diluida en un párrafo al final), porque los modelos de imagen priorizan mejor las restricciones de estilo cuando están estructuradas y adelante. **Importante**: la instrucción temática (`t_config_promo.instruccion_extra`) NO se pasa por separado a `generar-imagen` — el tema ya viene dado por el título/descripción/CTA de la promoción de texto (que sí usó esa instrucción en `generar-promos`); pasarla de nuevo en la imagen es redundante. (3) el logo generado tenía un error ortográfico ("grafikõ" con tilde de portugués en vez de "Grafiko" o "grafikó") — se agregó una regla explícita de idioma al final del prompt: español rioplatense/argentino, uso correcto de "ñ", prohibición de diacríticos de otros idiomas, y el nombre exacto de la marca deletreado ("Grafiko", con K, sin tildes). **Si el problema de idioma persiste, el siguiente paso sería mandarle a Gemini las imágenes de referencia originales como input visual directo (el modelo es multimodal) en vez de solo la descripción en texto — no implementado todavía, evaluar si hace falta.**
  - **Backend**: migración `supabase/migrations/20260707095711_promociones_ia_wallet.sql`: tablas `t_saldo_marketing` (singleton), `t_transacciones_marketing`, `t_promociones`, `t_config_promo` (singleton); RPCs `cargar_saldo_marketing` y `descontar_saldo_marketing` (atómicas, mismo patrón que `registrar_cobro_con_fifo`). Edge Function `generar-promos` desplegada (`supabase/functions/generar-promos/index.ts`, `verify_jwt: true`): descuenta 600 créditos, arma contexto real (productos más vendidos vía `t_trabajo_productos`, productos con stock bajo vía `t_productos.stock < 5`), llama a Gemini, guarda 4 propuestas en `t_promociones`. Secret `GEMINI_API_KEY` configurado por el usuario en Supabase Dashboard.
  - **Fixes post-entrega (2026-07-07, `version: 7` de la función)**: (1) faltaba manejo de preflight `OPTIONS` — el browser lo reportaba como "CORS error" porque caía en el chequeo de método y devolvía 405; se agregaron `corsHeaders` (`Access-Control-Allow-Origin/Headers/Methods`) en todas las respuestas y un handler explícito para `OPTIONS`. (2) el modelo `gemini-1.5-flash` daba 404 "not found" porque la API key del usuario es de una cuenta con modelos más nuevos (confirmado vía `GET /v1beta/models?key=...`, que devolvió hasta Gemini 3.5) — cambiado a `gemini-2.5-flash` (estable, soporta `generateContent`). **Si esto vuelve a fallar con 404 de modelo, correr ese mismo endpoint de listado para confirmar el nombre vigente antes de adivinar.**
  - **Verificado funcionando end-to-end por el usuario en la app real** (no solo build/typecheck) el 2026-07-07: carga de saldo, descuento de 600 créditos, llamada a Gemini y guardado de las 4 propuestas confirmado en producción de uso.

  - **Frontend** (por Gemini, revisado y verificado por Claude): `src/pages/PromotionsPage.tsx` en la ruta `/promociones` (agregada a `App.tsx` y al menú de `Layout.tsx` con ícono `auto_awesome`). Incluye: card de wallet con gradiente violeta/índigo, modal de carga de saldo (`cargar_saldo_marketing`), botón de generación que invoca la Edge Function `generar-promos` (con manejo robusto de errores de `FunctionsHttpError`, incluido parseo del body de error), auto-deshabilitado si saldo < 600, listado de propuestas con aprobar/rechazar (`update` directo en `t_promociones`), panel de instrucción extra (`t_config_promo`, `upsert`), historial colapsable de `t_transacciones_marketing`. Verificado con `tsc --noEmit` y `npm run build` (ambos limpios, código de salida 0).
  - **Fase 4 completa.**

- **Fase 3 — Facturación ARCA/AFIP** — en curso, iniciada 2026-07-07. Prerrequisitos ya resueltos por el usuario: VPS propio (Hostinger, `srv1055314.hstgr.cloud`, Ubuntu 24.04, panel hPanel) con backend ARCA **ya funcionando en producción para otros clientes** (contenedor Docker `root-arca-backend`, carpeta `/root/arca-backend`, puerto interno 3001), certificado AFIP real ya tramitado. **No es un backend nuevo a construir — es una integración con un backend externo ya existente que no se debe modificar.**
  - **Arquitectura confirmada leyendo el código real** (`cat /root/arca-backend/index.js` vía terminal del VPS, con el usuario pegando los resultados): usa `@afipsdk/afip.js` + `soap` + `node-forge` (WSAA con firma CMS/PKCS#7, WSFE vía SOAP, endpoint `POST /api/facturar`). Identifica el tenant por `supabaseUrl` contra un mapa `TENANT_<NOMBRE>_URL`/`TENANT_<NOMBRE>_KEY` en el `.env` del VPS (tenants ya dados de alta: `ANTIGRAVITY`, `TEMPLATE`; Grafiko sería un tercero, **pendiente de agregar por el usuario en el `.env` del VPS** — no se hizo todavía).
  - **Problema detectado y resuelto por diseño**: el backend espera un esquema genérico (`ventas`, `clientes`, `configuracion`, `facturas_arca`, con concepto de `local_id`) que Grafiko no tiene (usa `t_trabajos`/`t_clientes`, sin sucursales). En vez de duplicar datos o tocar el backend en producción de otros clientes, se optó por vistas de Postgres sobre las tablas reales. `local_id` se resuelve con el valor fijo `'principal'`.
  - **Backend Grafiko**: migración `supabase/migrations/20260707112750_integracion_arca.sql`: tablas nuevas `configuracion` (singleton, `servicios` JSONB con estructura `servicios.arca.principal = {cuit, punto_venta, modo, condicion_iva, certificado_crt, clave_privada_key}`) y `facturas_arca` (registro de comprobantes, columnas exactas que el backend externo inserta — no renombrar sin coordinar con `index.js` del VPS). Vista `clientes` sobre `t_clientes` (normaliza `situacion_iva` a `iva_cond`: `responsable_inscripto`/`monotributo`/`exento`/`consumidor_final`). Vista `ventas` sobre `t_trabajos`, con un detalle crítico: el backend hace `UPDATE ventas SET estado='facturado'` tras emitir el CAE, pero `t_trabajos.estado` es el estado real del Kanban de producción (`PRESUPUESTADO`/`APROBADO`/`EN PRODUCCIÓN`/`ENTREGADO`) y no debía pisarse. Se resolvió con un trigger `INSTEAD OF UPDATE` (`trg_ventas_update`) que redirige ese UPDATE a la columna booleana `t_trabajos.facturado` (preexistente, sin uso previo) en vez de tocar `estado`. Todo verificado aplicado y funcionando (`select count(*) from ventas/clientes` ok, trigger confirmado con `pg_trigger`).
  - **Página de configuración hecha** (por Gemini, revisado por Claude, 2026-07-07): `src/pages/ArcaConfigPage.tsx` en la ruta `/configuracion/arca` (agregada a `App.tsx`, con link desde `ConfigDropdownPage.tsx`). Lee/escribe `configuracion.servicios.arca.principal` correctamente. Buena resolución de seguridad: la clave privada nunca se muestra en texto tras guardarse (se enmascara con badge "Guardada"), y si el usuario deja el campo vacío al re-guardar, conserva la clave existente en vez de sobreescribirla con vacío. Valida CSR-vs-CRT (advierte si se pega `BEGIN CERTIFICATE REQUEST` en vez de `BEGIN CERTIFICATE`), CUIT de 11 dígitos, punto de venta positivo, banner de advertencia al elegir modo producción. Incluye historial de `facturas_arca` con badges de estado y mensaje de error visible. Usa `.upsert()` en vez de `.update()` (funciona igual, `id=1` siempre existe). Verificado con `tsc --noEmit` y `npm run build` (limpios).
  - **Fix de integridad de datos (2026-07-07)**: `JobModal.tsx` tenía un checkbox editable manualmente para `t_trabajos.facturado`, que ahora es el mismo campo que el trigger `trg_ventas_update` marca automáticamente cuando ARCA confirma un CAE real. Detectado por el usuario: dejar el checkbox editable permitía marcar "Facturado" a mano sin que existiera ninguna factura real, desincronizando el dato de la realidad fiscal. Se reemplazó el checkbox por un badge de solo lectura ("Facturado"/"Sin facturar", según el valor ya guardado) y se excluyó `facturado` explícitamente del payload de `handleSubmit` (`const { total, sena, facturado, ...rest } = data`), así el formulario nunca puede sobrescribirlo. Verificado con `tsc --noEmit` y `npm run build` (limpios). **La única vía legítima para que `t_trabajos.facturado` cambie a `true` es el trigger `trg_ventas_update`, disparado por el backend ARCA externo tras obtener un CAE real.**
  - **Botón "Facturar con ARCA" hecho** (por Gemini, revisado por Claude, 2026-07-07): en `src/pages/BillingPage.tsx`. `fetchInvoices` trae en paralelo `t_comprobantes`, `v_estado_comprobantes` (reusado, no duplicado) y `facturas_arca` (filtrado `estado='aprobada'`, mapeado por `venta_id`). Columna nueva "ARCA/AFIP": si el comprobante no es facturable (sin `trabajo_id` o `tipo` no empieza con "Factura") muestra "No facturable"; si ya existe `facturas_arca` aprobada para ese trabajo, muestra PV/número/CAE en vez de botón; si no, botón activo "Facturar ARCA" que hace `fetch` directo (no `supabase.functions.invoke`) a `POST https://arca.srv1055314.hstgr.cloud/api/facturar`. Manejo de error especial para "ARCA no esta configurado para esta sucursal": toast con link directo a `/configuracion/arca`. `colSpan` de loading/empty actualizado a 8. Verificado con `tsc --noEmit` y `npm run build` (limpios, código de salida 0).
  - **Tenant Grafiko dado de alta en el VPS (2026-07-07)**: el usuario agregó `TENANT_GRAFIKO_URL=https://eoznwxfflcmpivnwafwd.supabase.co` y `TENANT_GRAFIKO_KEY=<service_role_key>` al `.env` de `/root/arca-backend` (vía terminal del VPS, comandos pasados por Claude, nunca se compartió la key en el chat) y reinició el contenedor Docker (`docker restart 1504e3b40049_root-arca-backend-1`). Confirmado `Up` y sano tras el restart. Tenants ya registrados en ese backend: `ANTIGRAVITY`, `TEMPLATE`, `GRAFIKO`.
  - **Pendiente**:
    1. **El usuario tiene que cargar los datos reales de ARCA** en `/configuracion/arca` (CUIT, punto de venta, certificado `.crt`, clave `.key`, modo — empezar en `homologacion`). Sin esto, facturar va a fallar con "ARCA no esta configurado para esta sucursal".
    2. Probar el flujo end-to-end en modo `homologacion` antes de pasar a `produccion`.
  - **Fase 3 (frontend + infraestructura de tenant) completa.** Solo falta que el usuario cargue sus datos fiscales reales y pruebe el flujo end-to-end en homologación.
  - **Nota de seguridad pendiente, decisión consciente del usuario**: la tabla `configuracion` tiene la misma RLS abierta que el resto (`authenticated` puede hacer `SELECT *`, incluyendo el certificado/clave en texto plano). Se evaluó restringirlo a solo `service_role` pero el usuario decidió dejarlo así por ahora (es el único usuario del sistema). Revisar si se suman operadores sin rol administrativo.

## Pendientes conocidos

- No hay carpeta `services/` — las llamadas a Supabase están directo en componentes/páginas.
- No hay tests automatizados en el repo.
- Roles (`Administrador`/`Operador`) existen en `t_roles` pero no hay evidencia de que se apliquen a nivel de RLS o de UI (falta confirmar).

## Lo que NO hacer

- No deshabilitar RLS en ninguna tabla.
- No usar `service_role` key en el cliente — solo en contextos server-side (Edge Functions, backend propio) si se llegan a implementar.
- No poner secrets en variables `VITE_*`.
- No modificar `v_saldo_clientes` u otras vistas financieras sin revisar antes qué depende de ellas (`pg_depend`), porque Postgres no permite `CREATE OR REPLACE VIEW` si cambia el orden/nombre de columnas — requiere `DROP VIEW` + `CREATE VIEW`.
- No aplicar migraciones a la base remota sin confirmación explícita del usuario antes de ejecutar.
- No asumir el schema genérico de prompts externos (`ventas`, `pagos`, `caja_sesiones`) — este proyecto tiene su propio modelo (`t_trabajos`, `t_comprobantes`, `t_recibos`, etc.), documentado arriba.
