# Prompt para Gemini — Fase 3 del módulo Compras: Compras a proveedores

> Copiá TODO lo que está debajo de la línea y pegalo en Gemini. El backend (tablas, vistas, triggers y funciones de Supabase) ya está hecho y probado; **solo falta el frontend**.

---

## ROL Y CONTEXTO

Sos un desarrollador frontend senior trabajando en **Grafiko**, un sistema de gestión para una imprenta (single-tenant, en uso de prueba). Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + react-hook-form + react-hot-toast + Supabase JS v2**. La interfaz está en **español rioplatense** (voseo: "Ingresá", "Elegí", "¿Estás seguro?").

Tu tarea: construir la pantalla **Compras** (`/compras`): listar compras a proveedores, registrar una compra nueva y anularla. Una compra ya hecha **nunca se edita** (se anula y se carga otra). **No escribas SQL ni toques `supabase/`**: el backend ya existe (ver "Contrato de base de datos").

Qué hace una compra en el sistema (todo lo hace la base, en una sola operación atómica): guarda la compra y sus ítems, **suma stock** a los insumos, actualiza el **último costo** de cada insumo, carga la deuda en la **cuenta corriente del proveedor** y, si es **al contado**, registra el pago y (opcionalmente) la **salida de la caja**.

## ANTES DE ESCRIBIR CÓDIGO, LEÉ ESTOS ARCHIVOS (referencia de estilo y patrones)

1. `src/pages/SuppliersPage.tsx` y `src/pages/InsumosPage.tsx` — listado con tarjetas de resumen, buscador (`normalizeText`), pestañas/filtros y tabla. **Copiá su estructura y sus clases.**
2. `src/components/SupplierModal.tsx` — **lo vas a reutilizar** para el alta rápida de proveedor (ver más abajo).
3. `src/components/SupplierPaymentModal.tsx` — patrón de modal con forma de pago, checkbox "Descontar de la caja", tipo de gasto y advertencia de efectivo negativo (**copiá esa lógica** para la compra al contado).
4. `src/components/StockMovementModal.tsx` — patrón de modal con selector de unidad (stock / compra) y vista previa en vivo.
5. `src/components/JobModal.tsx` — mirá el desplegable de **cliente** (buscador con botón final "Crear cliente «texto»"): es el patrón exacto que tenés que repetir con el proveedor.
6. `src/utils/dates.ts` — helpers de fechas **obligatorios**.
7. `src/App.tsx` — para la ruta. El menú ya tiene el ítem **Compras** apuntando a `/compras` (`Layout.tsx`); **no lo toques**.

## QUÉ HAY QUE CONSTRUIR

Archivos nuevos:

| Archivo | Qué es |
|---|---|
| `src/pages/PurchasesPage.tsx` | Página `/compras`: listado, buscador, filtros y resumen |
| `src/components/PurchaseModal.tsx` | Registrar una compra nueva |
| `src/components/PurchaseDetailModal.tsx` | Ver el detalle de una compra y anularla |

Archivo existente que SÍ podés modificar (solo agregar): `src/App.tsx` → agregar la ruta `/compras` con el mismo patrón que `/proveedores` (`<Layout title="Compras"><PurchasesPage /></Layout>`, protegida por `user`), **antes** de la ruta comodín `/*` de "Módulo en construcción".

**No modifiques ningún otro archivo** (ni `SupplierModal`, ni `Layout`, ni los de insumos).

### 1. `PurchasesPage.tsx`

- **Tarjetas de resumen** (estilo de SuppliersPage): compras del mes (suma de `total` de las **no anuladas** con `fecha` del mes actual; usá `todayAR()` para saber el mes) · compras pendientes de pago (cantidad de compras a cuenta corriente no anuladas del mes, solo informativo) · compras anuladas del mes.
- **Buscador de texto libre** (AND entre palabras, sin tildes ni mayúsculas) sobre proveedor, N° de comprobante y observaciones.
- **Filtros**: select de proveedor (Todos), pestañas Todas / Recibidas / Anuladas, fecha desde y hasta (sobre `fecha`, que es una columna `date` `YYYY-MM-DD`: filtrá con `.gte('fecha', desde)` / `.lte('fecha', hasta)` directamente, sin convertir a `Date`).
- **Tabla** (de `v_compras`, orden `fecha` desc, `created_at` desc, `limit(300)`): fecha (`formatDateAR`), proveedor, N° comprobante, condición (badge: "Contado · {forma_pago}" o "Cuenta corriente"), cantidad de ítems, **total**, estado (badge "Recibida" verde / "Anulada" rojo, con la fila en gris tachando el total si está anulada). Fila clickeable → abre `PurchaseDetailModal`.
- Botón "Nueva Compra" arriba a la derecha → abre `PurchaseModal`.
- Estados de carga y vacío. Recargar la lista tras registrar o anular una compra.

### 2. `PurchaseModal.tsx` (nueva compra)

Props: `onClose`, `onSuccess`. Campos:

**a) Proveedor** — combobox con buscador (solo proveedores **activos**, de `v_saldo_proveedores` con `activo = true`, ordenados por nombre). Al final del desplegable, **siempre visible**, un botón fijo:
`Crear proveedor "{texto tipeado}"` (o "Crear proveedor nuevo" si el buscador está vacío), con ícono `person_add`. Al tocarlo abre `SupplierModal` (`import SupplierModal from './SupplierModal'`) pasando `initialNombre={textoTipeado}`. **`SupplierModal` ya soporta esto**: su `onSuccess(created)` recibe `{ id, nombre }` del proveedor recién creado. Al recibirlo: sumalo a la lista local (ordenada), seleccionalo y poné su nombre en el buscador, **sin recargar toda la pantalla**. Copiá el patrón del desplegable de cliente de `JobModal.tsx` (`onMouseDown` con `e.preventDefault()` para que el `onBlur` del input no cierre el desplegable antes del click).
Cuando hay proveedor elegido, mostrar debajo una línea chica con su condición de pago habitual y su saldo (`saldo_pendiente`, mismo color que en SuppliersPage: rojo "Le debemos $X" / verde "Sin deuda"). Sirve solo de ayuda.

**b) Datos de la compra** — `fecha` (date, default `todayAR()`), `nro_comprobante` (texto opcional, ej. "FA-0001-00001234"), `observaciones` (opcional).

**c) Ítems** — una lista editable, con al menos un ítem. Cada fila:
- **Insumo**: combobox con buscador sobre `v_insumos_stock` (solo `activo = true`, orden por nombre; buscá por nombre y código). Mostrá al lado el stock actual y la unidad. Si el usuario no encuentra el insumo, un texto de ayuda debajo de la lista: "Si el insumo no existe, crealo primero en Insumos" (con `<a href="/insumos">`). **No** hay alta rápida de insumos en esta pantalla.
- **Cantidad** (número > 0, `step="any"`).
- **Unidad** (solo si el insumo tiene `unidad_compra_nombre`): selector "En: (•) {unidad_compra_nombre} ( ) {unidad_stock_nombre}" → define `en_unidad_compra`. Por defecto la **unidad de compra**. Si el insumo no tiene unidad de compra, la unidad es la de stock y no se muestra el selector.
- **Costo unitario** (número ≥ 0, `step="any"`, **por la unidad elegida**). Al elegir el insumo o cambiar la unidad, **pre-cargalo** con el último costo: si la unidad elegida es la de compra → `ultimo_costo_compra`; si es la de stock → `ultimo_costo_compra / factor_compra`. El usuario lo puede cambiar. Si el `ultimo_costo_compra` es 0, dejalo vacío.
- **Subtotal de la línea** en vivo (`cantidad × costo`) y, si la unidad es la de compra y el factor ≠ 1, una línea gris: "= {cantidad × factor} {unidad_stock_nombre} de stock".
- Botón para quitar la fila y botón "Agregar ítem".
- **Total de la compra** en vivo (suma de subtotales). Es una **vista previa**: el total real lo calcula la base.

**d) Forma de pago** — dos opciones (segmentado): **Contado** / **Cuenta corriente** (por defecto: la `condicion_pago` del proveedor elegido).
- **Contado**: select `forma_pago` con `['Efectivo', 'Transferencia', 'Cheque', 'Mercado Pago', 'QR', 'Banco', 'Otro']` (default Efectivo); checkbox **"Descontar de la caja"** (default tildado); si está tildado, select opcional **"Tipo de gasto"** cargado de `t_conf_tipos_gasto` (`id, nombre`, orden por nombre) **preseleccionando el que se llame "Insumos"** si existe. **Advertencia amarilla, sin bloquear** (copiala de `SupplierPaymentModal`): si `forma_pago === 'Efectivo'`, "Descontar de la caja" está tildado y el total supera el `efectivo_esperado` de `v_caja_efectivo_actual`, avisar que dejaría la caja en negativo.
- **Cuenta corriente**: solo un texto de ayuda: "Se carga como deuda con el proveedor. Podés registrar el pago después desde Proveedores."

**e) Confirmar** — llamar **exactamente** a la RPC de abajo. Validá antes en el frontend con mensajes claros: proveedor obligatorio, al menos un ítem, todos con insumo, cantidad > 0 y costo ≥ 0, total > 0. En éxito: toast `Compra registrada por $X. Stock actualizado.` (y, si fue a cuenta corriente, agregar `Saldo con el proveedor: $Y`), llamar `onSuccess()` y `onClose()`. En error: `toast.error(error.message)` (los mensajes vienen en español desde la base, ej. "No hay una caja abierta para registrar la salida del pago"; mostralos tal cual).

### 3. `PurchaseDetailModal.tsx`

Props: `purchase` (fila de `v_compras`), `onClose`, `onSuccess`.
- Encabezado: proveedor, fecha, N° de comprobante, estado, condición de pago, total, observaciones.
- **Ítems** de `v_compra_items` (filtrando por `compra_id`): insumo, cantidad con su unidad (si `en_unidad_compra` → `unidad_compra_nombre`, si no `unidad_stock_nombre`), costo unitario, subtotal y, debajo en gris, "= {cantidad_stock} {unidad_stock_nombre} en stock" cuando la unidad de compra difiere.
- Si está **anulada**: mostrar un bloque rojo con la fecha de anulación (`anulada_at`, con `toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`) y el `motivo_anulacion`; **sin botón de anular**.
- Si está **recibida**: botón **"Anular compra"** → pide confirmación con un campo **motivo (obligatorio)** y este texto de aviso: "Se va a descontar del stock lo que se compró y se va a revertir la deuda con el proveedor." Si la compra fue **al contado**, agregar: "Como ya se pagó, el pago queda como saldo a favor con el proveedor (no se devuelve a la caja: registrá el reintegro cuando el proveedor te devuelva el dinero)."
- Al confirmar, llamar a la RPC de anulación. Toast de éxito: `Compra anulada.`; si `insumos_en_negativo > 0`, además `toast` de advertencia (ícono ⚠️ con `toast(...)`): "{n} insumo(s) quedaron con stock negativo: revisá si ya se consumieron." Llamar `onSuccess()` y `onClose()`.

## CONTRATO DE BASE DE DATOS (ya existe, no lo cambies ni lo repliques)

**Vista `v_compras`** (solo lectura, listado): `id`, `proveedor_id`, `proveedor_nombre`, `fecha` (date `YYYY-MM-DD`), `nro_comprobante`, `estado` (`'recibida' | 'anulada'`), `condicion_pago` (`'contado' | 'cuenta_corriente'`), `forma_pago` (null si es cuenta corriente), `total`, `observaciones`, `anulada_at`, `motivo_anulacion`, `usuario_id`, `created_at`, `cantidad_items`.

**Vista `v_compra_items`** (solo lectura): `id`, `compra_id`, `insumo_id`, `insumo_nombre`, `unidad_stock_nombre`, `unidad_compra_nombre` (null si no tiene), `factor_compra`, `cantidad`, `en_unidad_compra`, `costo_unitario`, `cantidad_stock`, `subtotal`, `created_at`.

**Vista `v_insumos_stock`** (solo lectura, para el selector de insumos): `id`, `nombre`, `codigo`, `unidad_stock_nombre`, `unidad_compra_nombre`, `factor_compra`, `stock`, `ultimo_costo_compra` (por unidad de **compra**), `activo`, entre otras.

**Vista `v_saldo_proveedores`**: `id`, `nombre`, `condicion_pago`, `activo`, `saldo_pendiente` (>0 = le debemos), entre otras. **Vista `v_caja_efectivo_actual`**: una fila con `efectivo_esperado`. **Tabla `t_conf_tipos_gasto`**: `id`, `nombre`.

Los `numeric` pueden llegar como string: usá `Number(...)`.

**RPC para registrar la compra:**
```ts
const { data, error } = await supabase.rpc('registrar_compra', {
  p_proveedor_id: proveedor.id,               // uuid
  p_items: items.map(i => ({                  // jsonb: array de objetos
    insumo_id: i.insumoId,                    // uuid
    cantidad: Number(i.cantidad),             // > 0, en la unidad elegida
    en_unidad_compra: i.enUnidadCompra,       // boolean
    costo_unitario: Number(i.costoUnitario),  // >= 0, por la unidad elegida
  })),
  p_condicion_pago: condicion,                // 'contado' | 'cuenta_corriente'
  p_forma_pago: condicion === 'contado' ? formaPago : null,
  p_fecha: fecha,                             // 'YYYY-MM-DD'
  p_nro_comprobante: nro || null,
  p_registrar_en_caja: condicion === 'contado' ? descontarDeCaja : false,
  p_tipo_gasto_id: condicion === 'contado' && descontarDeCaja && tipoGastoId ? tipoGastoId : null,
  p_observaciones: observaciones || null,
  p_usuario_id: user?.id || null,             // useAuthStore().user?.id
});
// data: [{ nueva_compra_id, total_compra, saldo_proveedor }]  (array de una fila)
```

**RPC para anular:**
```ts
const { data, error } = await supabase.rpc('anular_compra', {
  p_compra_id: purchase.id,
  p_motivo: motivo,                           // obligatorio
  p_usuario_id: user?.id || null,
});
// data: [{ compra_anulada_id, saldo_proveedor, insumos_en_negativo }]
```

## REGLAS OBLIGATORIAS (aprendidas de errores anteriores en este proyecto — no las ignores)

1. **El total, el stock, el costo y los saldos NO se calculan ni se escriben en el frontend.** Nada de `insert`/`update`/`delete` sobre `t_compras`, `t_compra_items`, `t_insumos`, `t_movimientos_*`: todo pasa por las dos RPC. (Excepción: las **vistas previas en vivo** de subtotales/total y las advertencias del modal, que son solo informativas.)
2. **Fechas — usá `src/utils/dates.ts`**: `todayAR()` para hoy y `formatDateAR()` para mostrar fechas de calendario (`fecha`). **Prohibido** `new Date().toISOString().split('T')[0]` y `new Date('YYYY-MM-DD')`. Para timestamps (`anulada_at`) usá `toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`.
3. **Tailwind v4: clases completas y literales.** No armes clases por concatenación (`` `bg-${color}-500` `` no funciona); usá un objeto con las clases completas. **No inventes clases**: `rounded-2.5xl` NO existe; usá `rounded-[1.75rem]`, `rounded-[2rem]` o `rounded-[2.5rem]`. Copiá las clases de SuppliersPage/InsumosPage.
4. **Evitá loops de renders**: un `useCallback`/`useEffect` no debe depender de un estado que él mismo actualiza. Fetch con `useCallback(..., [])` o dependencias primitivas estables, disparados desde un `useEffect`. Al actualizar listas desde un callback usá el updater funcional (`setX(prev => ...)`).
5. **Errores**: todo acceso a Supabase con `try/catch` o chequeo de `error` y `toast.error('Error al ...: ' + error.message)`. Botones de confirmar con estado `loading` (evita doble envío: una compra duplicada mueve stock y plata dos veces).
6. **Formato**: montos con `Number(x).toLocaleString('es-AR', { minimumFractionDigits: 2 })` precedidos de `$`; cantidades con `toLocaleString('es-AR', { maximumFractionDigits: 3 })`. Inputs numéricos con `step="any"`.
7. Íconos: `<span className="material-symbols-outlined">nombre</span>`. No instales paquetes.
8. Componentes con `React.FC`, modales montados condicionalmente desde la página (`{isOpen && <XModal onClose={...} onSuccess={refetch} />}`). Capas (`z-index`): `SupplierModal` tiene fijo `z-[100]` y **no lo podés modificar**, y se abre encima de `PurchaseModal`. Por eso `PurchaseModal` y `PurchaseDetailModal` deben usar **`z-[95]`** en su contenedor `fixed inset-0` (más bajo que 100), y montá el `SupplierModal` como hermano (no anidado) para que quede por encima.
9. No uses `service_role` ni variables de entorno nuevas. El cliente se importa de `../lib/supabase`.
10. Cada botón de solo ícono lleva `title="..."`; cada input, su `<label>`.

## FUERA DE ALCANCE (no lo hagas)

Alta rápida de insumos, edición de compras ya registradas, pagos parciales o anticipos, compras de productos del catálogo de venta, órdenes de compra/presupuestos a proveedores, adjuntar archivos, PDF, exportar a Excel. Si algo te parece necesario, **mencionalo al final** en vez de implementarlo.

## CÓMO VERIFICAR TU TRABAJO ANTES DE ENTREGAR

1. Corré **`npm run build`** (NO `npx tsc --noEmit`: en este proyecto ese comando no revisa nada y siempre da "ok"; el build sí usa `tsc -b`). Debe pasar sin errores.
2. Checklist:
   - [ ] `/compras` abre la pantalla nueva (ya no "Módulo en construcción") y el menú "Compras" queda resaltado.
   - [ ] En "Nueva Compra", escribir un proveedor que no existe y tocar `Crear proveedor "..."` abre el alta con el nombre ya cargado; al guardar queda seleccionado en la compra sin recargar.
   - [ ] Comprar "2 Resmas" de un insumo con factor 500 muestra "= 1.000 Hoja de stock"; cambiar a la unidad de stock recalcula el costo pre-cargado (`ultimo_costo_compra / factor`).
   - [ ] Una compra al **contado en efectivo** con "Descontar de la caja" descuenta de Caja (verificalo en `/caja`) y el saldo del proveedor queda en 0; una compra a **cuenta corriente** deja el saldo del proveedor en rojo por el total.
   - [ ] Sin caja abierta, la compra al contado con "Descontar de la caja" muestra el error de la base y **no** se registra nada.
   - [ ] "Anular compra" exige motivo; después de anular, el stock del insumo baja lo comprado, la compra aparece "Anulada" y no se puede anular de nuevo.
   - [ ] Las fechas de la tabla coinciden con las cargadas (sin corrimiento de un día).
3. Al final, listá los archivos creados/modificados y cualquier duda o decisión que hayas tomado por tu cuenta.
