# Prompt para Gemini — Fase 1 del módulo Compras: ABM de Proveedores + Cuenta Corriente + Pagos

> Copiá TODO lo que está debajo de la línea y pegalo en Gemini. El backend (tablas, vistas y funciones de Supabase) ya está hecho y probado; **solo falta el frontend**.

---

## ROL Y CONTEXTO

Sos un desarrollador frontend senior trabajando en **Grafiko**, un sistema de gestión para una imprenta (single-tenant, ya en uso de prueba). Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + react-hook-form + react-hot-toast + Supabase JS v2**. El idioma de la interfaz es **español rioplatense** (voseo: "Ingresá", "Elegí", "¿Estás seguro?").

Tu tarea: construir la pantalla **Proveedores** con alta/edición, cuenta corriente y registro de pagos. **No tenés que escribir SQL ni tocar la carpeta `supabase/`**: todo el backend ya existe (ver "Contrato de base de datos").

## ANTES DE ESCRIBIR CÓDIGO, LEÉ ESTOS ARCHIVOS (son tu referencia de estilo y patrones)

1. `src/pages/ClientsPage.tsx` — listado + buscador + tarjetas de resumen + cómo se abren los modales. Copiá su estructura visual y su función de búsqueda de texto libre (`normalizeText` + `clientMatchesSearch`: AND entre palabras, sin distinguir mayúsculas ni tildes, CUIT/teléfonos también buscables solo con dígitos).
2. `src/components/ClientModal.tsx` — patrón de modal de alta/edición con `react-hook-form`.
3. `src/components/ClientLedgerModal.tsx` — patrón de modal de cuenta corriente (encabezado con saldo, historial).
4. `src/components/PaymentModal.tsx` y `src/components/AdjustmentModal.tsx` — patrón de modales de cobro y ajuste (los tuyos son la versión "proveedor" de estos).
5. `src/pages/CashRegisterPage.tsx` — mirá la constante `METODOS_PAGO` y `formatMoney` (definidos arriba en el archivo) y los modales de gasto/ingreso.
6. `src/utils/dates.ts` — helpers de fechas **obligatorios** (ver reglas).
7. `src/App.tsx` y `src/components/Layout.tsx` — para registrar la ruta y el ítem de menú.

## QUÉ HAY QUE CONSTRUIR

Archivos nuevos:

| Archivo | Qué es |
|---|---|
| `src/pages/SuppliersPage.tsx` | Página `/proveedores`: listado, buscador, filtros, resumen |
| `src/components/SupplierModal.tsx` | Alta y edición de proveedor |
| `src/components/SupplierLedgerModal.tsx` | Cuenta corriente del proveedor (historial + botones de acción) |
| `src/components/SupplierPaymentModal.tsx` | Registrar un pago al proveedor |
| `src/components/SupplierAdjustmentModal.tsx` | Ajuste manual: deuda anterior / nota de crédito / nota de débito |

Archivos existentes que SÍ podés modificar (solo agregar, sin cambiar lo demás):
- `src/App.tsx`: agregar la ruta `/proveedores` con el mismo patrón que `/clientes` (`<Layout title="Gestión de Proveedores"><SuppliersPage /></Layout>`, protegida por `user`).
- `src/components/Layout.tsx`: agregar en el array del menú `{ name: 'Proveedores', icon: 'factory', path: '/proveedores' }` **justo antes** del ítem `Compras`. No toques ningún otro ítem.

**No modifiques ningún otro archivo.**

### 1. `SuppliersPage.tsx`

- **Tarjetas de resumen** (mismo estilo que las de ClientsPage): total de proveedores activos · deuda total con proveedores (suma de `saldo_pendiente` positivos) · cantidad de proveedores a los que se les debe.
- **Buscador de texto libre** (una sola caja) sobre: nombre, razón social, CUIT (con y sin guiones), contacto, email, teléfonos, dirección, localidad, observaciones. Placeholder: "Buscar por nombre, CUIT, contacto, teléfono, localidad...".
- **Filtros**: selector Activos / Inactivos / Todos (por defecto Activos) y un check "Solo con deuda" (`saldo_pendiente > 0`).
- **Listado** (tabla en escritorio, tarjetas apiladas en móvil): nombre (y razón social debajo, si es distinta), CUIT, contacto y teléfono, badge de condición de pago ("Contado" / "Cuenta corriente"), y **saldo**.
- **Convención de saldo (importante):** `saldo_pendiente > 0` significa que **le debemos plata al proveedor** → mostrarlo en rojo con la leyenda "Le debemos". `saldo_pendiente <= 0` → verde con "Sin deuda" (si es negativo, "A favor: $X" en verde).
- Si el proveedor tiene `limite_credito > 0` y `saldo_pendiente > limite_credito`, mostrar un badge de advertencia "Excede límite".
- Acciones por fila (íconos Material Symbols): **cuenta corriente** (abre `SupplierLedgerModal`), **registrar pago** (abre `SupplierPaymentModal`), **editar** (abre `SupplierModal`), **dar de baja / reactivar** (cambia `activo`; con `confirm()` antes de dar de baja).
- Botón "Nuevo Proveedor" arriba a la derecha.
- **No existe borrado físico** de proveedores (tienen movimientos asociados y la base lo impide): solo baja lógica con `activo = false`.
- Estado de carga, y estado vacío ("No hay proveedores que coincidan").
- Recargar el listado después de cualquier alta, edición, pago o ajuste (`onSuccess`).

### 2. `SupplierModal.tsx` (alta / edición)

Props: `supplierId?: string`, `onClose`, `onSuccess`. Si viene `supplierId`, cargar los datos desde `v_saldo_proveedores` (o `t_proveedores`) y hacer `update`; si no, `insert`.

Campos (react-hook-form): 
- `nombre` (**obligatorio**, es el nombre con el que se lo ve en toda la app),
- `razon_social`, `cuit` (validar formato de 11 dígitos, admitir guiones; no obligatorio), `contacto`, `email` (validar formato si se completa), `telefonos`, `direccion`, `localidad`, `observaciones` (textarea),
- `condicion_pago`: select con `contado` → "Contado" y `cuenta_corriente` → "Cuenta corriente" (default `contado`),
- `limite_credito`: número ≥ 0 (default 0; solo visible si `condicion_pago === 'cuenta_corriente'`; 0 significa "sin límite definido").

Al guardar: convertir strings vacíos a `null` (excepto `nombre`). No mandes `id`, `created_at` ni `activo` en el insert (tienen default).

### 3. `SupplierLedgerModal.tsx` (cuenta corriente)

Props: `supplier` (objeto de `v_saldo_proveedores`), `onClose`, `onSuccess`.

- Encabezado con el nombre, y el **saldo actual** grande (misma convención de colores: rojo = le debemos, verde = sin deuda/a favor). Debajo, 4 mini-totales: cargos, notas de débito, pagos, notas de crédito (vienen de la vista).
- Dos botones: **"Registrar Pago"** (abre `SupplierPaymentModal`) y **"Ajustar Saldo"** (abre `SupplierAdjustmentModal`). Al volver de cualquiera de los dos, recargar el historial y el saldo del modal y llamar a `onSuccess()` para que la página también se refresque.
- Historial: `select` a la vista `v_cuenta_corriente_proveedor` filtrando por `proveedor_id`, ordenado por `fecha` desc, `created_at` desc. Columnas: fecha (`formatDateAR`), tipo (badge), concepto, forma de pago / referencia, monto (con signo: `cargo` y `nota_debito` suman a la deuda → rojo con "+", `pago` y `nota_credito` la reducen → verde con "−") y **saldo acumulado** (columna `saldo_acumulado`, ya calculada por la base: mostrala tal cual).
- Etiquetas de tipo: `cargo` → "Cargo", `pago` → "Pago", `nota_credito` → "Nota de crédito", `nota_debito` → "Nota de débito".
- Estado vacío: "Todavía no hay movimientos con este proveedor".

### 4. `SupplierPaymentModal.tsx`

Props: `supplier`, `onClose`, `onSuccess`. Campos:
- `monto` (obligatorio, > 0). Mostrar el saldo actual del proveedor como ayuda y un botón "Pagar todo" que completa con el saldo si es > 0.
- `forma_pago`: select con `['Efectivo', 'Transferencia', 'Cheque', 'Mercado Pago', 'QR', 'Banco', 'Otro']`.
- `fecha`: input date, default `todayAR()`.
- `referencia`: texto opcional (ej. "Recibo 123").
- **Checkbox "Descontar de la caja"** (default **tildado**): si está tildado se registra la salida de plata en la caja abierta; destildalo si el pago salió de otra cuenta que no pasa por la caja del local.
- Si "Descontar de la caja" está tildado: select opcional **"Tipo de gasto"** cargado desde `t_conf_tipos_gasto` (`select id, nombre order by nombre`), con opción vacía "Sin especificar".
- **Advertencia (no bloqueo)**: si `forma_pago === 'Efectivo'` y "Descontar de la caja" está tildado, consultar `v_caja_efectivo_actual` (`select efectivo_esperado`, una fila) y, si el monto es mayor al efectivo esperado, mostrar un aviso amarillo: "El efectivo esperado en caja es $X; este pago lo dejaría en negativo." Igual se puede confirmar.

Al confirmar, llamar **exactamente** a la RPC (ver contrato) y en éxito mostrar un toast del estilo: `Pago registrado. Saldo con el proveedor: $X` usando el `saldo_pendiente` que devuelve la RPC. Si la RPC falla, mostrar `error.message` en un toast de error (los mensajes ya vienen en español, por ejemplo "No hay una caja abierta para registrar la salida del pago" — mostralos tal cual).

### 5. `SupplierAdjustmentModal.tsx`

Props: `supplier`, `onClose`, `onSuccess`. Campos:
- `tipo`: select con tres opciones — `cargo` → "Deuda anterior / cargo manual", `nota_debito` → "Nota de débito (aumenta la deuda)", `nota_credito` → "Nota de crédito (reduce la deuda)". Debajo, un texto de ayuda que cambie según la opción elegida.
- `monto` (obligatorio, > 0), `concepto` (obligatorio), `fecha` (default `todayAR()`).
- Llama a la RPC `registrar_ajuste_proveedor`. Este modal **no toca la caja** (aclaralo en un texto de ayuda: "No afecta la caja").

## CONTRATO DE BASE DE DATOS (ya existe, no lo cambies ni lo repliques)

**Tabla `t_proveedores`** (escritura directa con `insert`/`update` desde `SupplierModal`): `id uuid`, `nombre varchar NOT NULL`, `razon_social`, `cuit`, `contacto`, `direccion`, `localidad`, `telefonos`, `email`, `observaciones text`, `condicion_pago text` (`'contado' | 'cuenta_corriente'`, default `'contado'`), `limite_credito numeric` (≥ 0, default 0), `activo boolean` (default true), `created_at`.

**Vista `v_saldo_proveedores`** (solo lectura — **usala para el listado y para el saldo**): todas las columnas de arriba (menos `id` que se llama igual) **más** `total_cargos`, `total_notas_debito`, `total_pagos`, `total_notas_credito`, `saldo_pendiente`. Los `numeric` pueden llegar como string desde PostgREST: convertí con `Number(...)` antes de operar.

**Vista `v_cuenta_corriente_proveedor`** (solo lectura, historial): `id`, `proveedor_id`, `fecha` (date, formato `'YYYY-MM-DD'`), `created_at`, `tipo` (`'cargo' | 'pago' | 'nota_credito' | 'nota_debito'`), `monto` (siempre positivo), `concepto`, `forma_pago`, `referencia`, `compra_id`, `saldo_acumulado`.

**RPC de pago:**
```ts
const { data, error } = await supabase.rpc('registrar_pago_proveedor', {
  p_proveedor_id: supplier.id,        // uuid
  p_monto: monto,                     // number > 0
  p_forma_pago: formaPago,            // string, ej. 'Efectivo'
  p_fecha: fecha,                     // 'YYYY-MM-DD'
  p_referencia: referencia || null,   // string | null
  p_registrar_en_caja: descontarDeCaja, // boolean
  p_tipo_gasto_id: tipoGastoId || null, // uuid | null (solo tiene efecto si p_registrar_en_caja es true)
  p_usuario_id: user?.id || null,     // useAuthStore().user?.id
});
// data: [{ movimiento_id, movimiento_caja_id, saldo_pendiente }]  (array de una fila)
```

**RPC de ajuste:**
```ts
const { data, error } = await supabase.rpc('registrar_ajuste_proveedor', {
  p_proveedor_id: supplier.id,
  p_tipo: tipo,            // 'cargo' | 'nota_credito' | 'nota_debito'
  p_monto: monto,
  p_concepto: concepto,
  p_fecha: fecha,
  p_usuario_id: user?.id || null,
});
// data: [{ movimiento_id, saldo_pendiente }]
```

**Vista `v_caja_efectivo_actual`** (solo lectura): una fila con `efectivo_esperado` (o ninguna fila si no hay caja abierta).
**Tabla `t_conf_tipos_gasto`**: `id`, `nombre`.

## REGLAS OBLIGATORIAS (aprendidas de errores anteriores en este proyecto — no las ignores)

1. **La plata NO se calcula en el frontend.** Saldos, totales y saldos acumulados salen de las vistas; los pagos y ajustes se registran **solo** vía las RPC de arriba. No hagas `insert` directo en `t_movimientos_proveedor` ni en `t_movimientos_caja`, y no sumes/restés movimientos en JS para mostrar un saldo. (Excepción: la advertencia de efectivo negativo del modal de pago, que es solo informativa.)
2. **Fechas — usá siempre `src/utils/dates.ts`**: `todayAR()` para "hoy" (formato `YYYY-MM-DD`), `formatDateAR(valor)` para mostrar fechas (`DD/MM/AAAA`). **Prohibido** `new Date().toISOString().split('T')[0]` y `new Date('YYYY-MM-DD')` (en Argentina dan el día equivocado).
3. **Tailwind v4: las clases deben escribirse completas y literales** en el código. No armes clases por concatenación (`` `bg-${color}-500` `` no funciona). Para variantes de color usá un objeto con las clases completas. **No inventes clases**: `rounded-2.5xl` NO existe; usá `rounded-[1.75rem]`, `rounded-[2rem]` o `rounded-[2.5rem]`. Copiá las clases de ClientsPage/ClientModal (paleta `primary` / `error` / `emerald` / `indigo`, labels `text-[10px] font-black uppercase tracking-widest`, títulos `font-headline font-extrabold`).
4. **Evitá loops de renders**: un `useCallback`/`useEffect` no debe tener como dependencia un estado que él mismo actualiza. Los fetch se hacen con `useCallback(..., [])` o con dependencias primitivas estables, y se disparan desde un `useEffect`. Si actualizás estado desde un `useCallback`, usá el updater funcional (`setX(prev => ...)`).
5. **Manejo de errores**: todo acceso a Supabase con `try/catch` (o chequeo de `error`) y `toast.error('Error al ...: ' + error.message)`. Éxitos con `toast.success(...)`. Botones de guardar con estado `loading` deshabilitado mientras dura la operación (evita doble envío).
6. **Formato de montos**: `Number(x).toLocaleString('es-AR', { minimumFractionDigits: 2 })`, precedido de `$`.
7. **Íconos**: `<span className="material-symbols-outlined">nombre</span>`. Nada de librerías nuevas: no instales paquetes.
8. Componentes funcionales con `React.FC`, modales montados condicionalmente desde la página (`{isOpen && <XModal onClose={...} onSuccess={refetch} />}`), igual que el resto del proyecto.
9. **No uses el `service_role` key ni variables de entorno nuevas.** El cliente `supabase` se importa de `../lib/supabase`.
10. Accesibilidad mínima: cada botón de solo ícono lleva `title="..."`; los inputs tienen su `<label>`.

## FUERA DE ALCANCE (no lo hagas)

Compras, insumos, stock, elaboración, generación de PDFs, notas de crédito con imputación a compras, exportar a Excel, paginación del listado, y cualquier cambio en las pantallas de Clientes/Caja/Trabajos. Si algo de esto te parece necesario, **mencionalo al final** en vez de implementarlo.

## CÓMO VERIFICAR TU TRABAJO ANTES DE ENTREGAR

1. `npx tsc --noEmit` → sin errores.
2. `npm run build` → sin errores.
3. Revisá a mano el checklist:
   - [ ] La ruta `/proveedores` abre la página y el ítem "Proveedores" aparece en el menú antes de "Compras".
   - [ ] Crear un proveedor solo con `nombre` funciona; con CUIT inválido muestra el error.
   - [ ] El buscador encuentra por CUIT escrito solo con dígitos y sin distinguir tildes.
   - [ ] Editar un proveedor no pierde campos.
   - [ ] Dar de baja lo saca de "Activos" y aparece en "Inactivos"; reactivar lo devuelve.
   - [ ] Un ajuste "Deuda anterior" de $10.000 deja el saldo en rojo "Le debemos $10.000,00".
   - [ ] Un pago de $4.000 lo baja a $6.000,00 y el historial muestra saldo acumulado correcto.
   - [ ] El pago con "Descontar de la caja" destildado no pide caja abierta.
   - [ ] Las fechas del historial coinciden con las que se cargaron (sin corrimiento de un día).
4. Al final, listá los archivos creados/modificados y cualquier duda o decisión que hayas tomado por tu cuenta.
