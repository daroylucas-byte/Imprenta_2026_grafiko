# Prompt para Gemini — Fase 2 del módulo Compras: Insumos y Stock

> Copiá TODO lo que está debajo de la línea y pegalo en Gemini. El backend (tablas, vistas, triggers y funciones de Supabase) ya está hecho y probado; **solo falta el frontend**.

---

## ROL Y CONTEXTO

Sos un desarrollador frontend senior trabajando en **Grafiko**, un sistema de gestión para una imprenta (single-tenant, en uso de prueba). Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + react-hook-form + react-hot-toast + Supabase JS v2**. La interfaz está en **español rioplatense** (voseo: "Ingresá", "Elegí", "¿Estás seguro?").

Tu tarea: construir la pantalla **Insumos** (papel, tintas, planchas, químicos, etc.): alta/edición de insumos, control de stock con movimientos, alertas de stock bajo e historial de movimientos. **No escribas SQL ni toques `supabase/`**: el backend ya existe (ver "Contrato de base de datos").

Un **insumo** es algo que la imprenta compra y consume (no se vende). Es distinto de los *productos* del catálogo de venta: no mezcles las pantallas ni las tablas.

## CONCEPTO CLAVE: dos unidades y un factor

Cada insumo tiene una **unidad de stock** (en la que se lleva el stock y se consume, ej. *Hoja*) y, opcionalmente, una **unidad de compra** (en la que se compra, ej. *Resma*) con un **factor**: `1 unidad de compra = factor unidades de stock` (ej. 1 Resma = 500 Hojas).
- Todo el stock se guarda **siempre en la unidad de stock**.
- Si el insumo no tiene unidad de compra, `unidad_compra_id` es `null` y `factor_compra` es `1`.
- Al registrar un movimiento, el usuario puede elegir cargarlo en la unidad de stock o en la de compra; **la conversión la hace la base** (parámetro `p_en_unidad_compra`), no la hagas vos.

## ANTES DE ESCRIBIR CÓDIGO, LEÉ ESTOS ARCHIVOS (referencia de estilo y patrones)

1. `src/pages/SuppliersPage.tsx` — **es tu mejor referencia**: listado con tarjetas de resumen, buscador de texto libre (`normalizeText`), pestañas de filtro, checkbox de filtro, tabla, acciones por fila y montaje de modales. Copiá su estructura y sus clases.
2. `src/components/SupplierModal.tsx` — patrón de modal de alta/edición con `react-hook-form`.
3. `src/components/SupplierPaymentModal.tsx` — patrón de modal que llama a una RPC.
4. `src/pages/CashRegisterPage.tsx` — pestañas "Turno Actual / Historial" (patrón de tabs) y `src/components/CashClosuresHistory.tsx` (patrón de tabla de historial).
5. `src/utils/dates.ts` — helpers de fechas **obligatorios** (ver reglas).
6. `src/App.tsx` y `src/components/Layout.tsx` — para la ruta y el menú.

## QUÉ HAY QUE CONSTRUIR

Archivos nuevos:

| Archivo | Qué es |
|---|---|
| `src/pages/InsumosPage.tsx` | Página `/insumos` con dos pestañas: **Insumos** (listado + stock) e **Historial de Movimientos** |
| `src/components/InsumoModal.tsx` | Alta y edición de insumo |
| `src/components/StockMovementModal.tsx` | Registrar entrada / salida / devolución / ajuste de stock |
| `src/components/StockHistoryPanel.tsx` | Contenido de la pestaña de historial (filtros + tabla) |

Archivos existentes que SÍ podés modificar (solo agregar):
- `src/App.tsx`: ruta `/insumos` con el mismo patrón que `/proveedores` (`<Layout title="Insumos y Stock"><InsumosPage /></Layout>`, protegida por `user`).
- `src/components/Layout.tsx`: agregar `{ name: 'Insumos', icon: 'inventory', path: '/insumos' }` **justo después** del ítem `Proveedores`. No toques ningún otro ítem.

**No modifiques ningún otro archivo.** (Las unidades de medida y las categorías se administran desde Configuración → categoría "Compras", que ya está hecha.)

### 1. `InsumosPage.tsx` — pestaña "Insumos"

- **Tarjetas de resumen** (estilo de SuppliersPage): insumos activos · con stock bajo · con stock negativo · valor total del stock (suma de `valor_stock` de los activos con stock > 0).
- **Buscador de texto libre** (AND entre palabras, sin distinguir mayúsculas ni tildes) sobre nombre, código, categoría y observaciones. Placeholder: "Buscar por nombre, código o categoría...".
- **Filtros**: pestañas Activos / Inactivos / Todos (default Activos), select de **categoría** (con opción "Todas") y check "Solo con alertas" (stock bajo o negativo).
- **Tabla**: nombre (con el código debajo si tiene), categoría, **stock** en la unidad de stock (ej. "1.200 Hojas") y, si el insumo tiene unidad de compra, debajo el equivalente en gris (ej. "= 2,4 Resmas", usando `stock_en_unidad_compra`), stock mínimo, último costo (`ultimo_costo_compra` por unidad de compra, ej. "$5.000,00 / Resma"; si no tiene unidad de compra, "/ {unidad de stock}") y estado.
- **Estado / alertas**: badge rojo "Stock negativo" si `stock_negativo`; badge ámbar "Stock bajo" si `bajo_minimo` (y no es negativo); nada si está bien. Si `stock_minimo` es 0, no hay alerta de stock bajo.
- **Acciones por fila** (íconos Material Symbols con `title`): **registrar movimiento** (abre `StockMovementModal`), **ver historial** (cambia a la pestaña Historial con ese insumo ya filtrado), **editar** (abre `InsumoModal`), **dar de baja / reactivar** (cambia `activo`, con `confirm()` al dar de baja).
- Botón "Nuevo Insumo".
- **No existe borrado físico** de insumos: solo baja lógica con `activo = false`.
- Mostrar en un texto de ayuda discreto: "Unidades y categorías se administran en Configuración → Compras".
- Estados de carga y vacío. Recargar después de cada alta, edición o movimiento.

### 2. `InsumoModal.tsx` (alta / edición)

Props: `insumoId?: string`, `onClose`, `onSuccess`. Con `insumoId`, cargar desde `t_insumos` y hacer `update`; sin él, `insert`.

Campos (react-hook-form):
- `nombre` (**obligatorio**), `codigo` (opcional), `categoria_id` (select desde `t_conf_categorias_insumo`, opcional, opción "Sin categoría"),
- **`unidad_stock_id`** (select obligatorio desde `t_conf_unidades_medida`, etiqueta "Unidad de stock (en la que se cuenta y consume)"). **Al editar, deshabilitarlo** con el texto "La unidad de stock no se puede cambiar después de crear el insumo",
- **`unidad_compra_id`** (select opcional, etiqueta "Unidad de compra (si se compra en otra unidad)", con opción "Igual que la de stock / no aplica"),
- **`factor_compra`**: **solo visible si hay unidad de compra elegida**. Mostrarlo como frase interactiva: `1 [Resma] = [ 500 ] [Hoja]` (nombres tomados de los selects), número > 0. Si no hay unidad de compra, guardar `unidad_compra_id = null` y `factor_compra = 1`,
- `stock_minimo` (número ≥ 0, en unidad de stock; 0 = sin alerta), `ultimo_costo_compra` (número ≥ 0, por unidad de compra; opcional, default 0), `observaciones`.
- **Solo en alta**: campo opcional **"Stock inicial"** (número ≥ 0, en la unidad de stock). Si es > 0, después de crear el insumo llamar a la RPC de movimientos con `p_tipo: 'ajuste'`, `p_stock_objetivo: stockInicial` y `p_motivo: 'Stock inicial'`.

**⚠️ IMPORTANTE:** **nunca mandes el campo `stock`** ni en `insert` ni en `update`. La base lo pone en 0 al crear y rechaza cualquier modificación directa (error "El stock no se puede modificar directamente"). El stock solo cambia con movimientos.

Al guardar: strings vacíos → `null` (excepto `nombre`). Validar con mensajes claros en español. No mandes `id`, `created_at` ni `activo` en el insert.

### 3. `StockMovementModal.tsx`

Props: `insumo` (objeto de `v_insumos_stock`), `onClose`, `onSuccess`. Encabezado con el nombre, el stock actual y su equivalente en unidad de compra si corresponde.

Campos:
- **Tipo** (segmentado o select): `entrada` → "Entrada (ingreso de mercadería)", `salida` → "Salida (consumo o uso)", `devolucion` → "Devolución", `ajuste` → "Ajuste (conteo físico)".
- Si el tipo es **entrada / salida / devolución**: `cantidad` (número > 0, `step="any"`). Si el insumo tiene unidad de compra, mostrar un selector **"Cantidad en: (•) {unidad de stock} ( ) {unidad de compra}"** que define `p_en_unidad_compra`.
- Si el tipo es **ajuste**: en vez de cantidad, `stock real contado` (número ≥ 0) con el mismo selector de unidad. Aclarar: "Indicá cuánto hay realmente; el sistema calcula la diferencia".
- `motivo`: texto. **Obligatorio en el ajuste**, opcional en los demás (placeholder según el tipo: "Ej: Compra factura 123", "Ej: Trabajo Folletos X", "Ej: Conteo del 30/9").
- **Vista previa en vivo** (es solo informativa, se calcula en el frontend): "Stock actual **X** → quedará **Y**" (con la conversión de unidades ya aplicada usando `factor_compra`). En el ajuste, mostrar además la diferencia con signo.
- **Advertencia amarilla, sin bloquear**, si una salida deja el stock en negativo: "Este movimiento dejaría el stock en negativo. Revisá si falta cargar una compra."

Al confirmar, llamar **exactamente** a la RPC (ver contrato). En éxito, toast: `Movimiento registrado. Stock actual: {stock_nuevo} {unidad de stock}`. En error, `toast.error` con `error.message` (los mensajes ya vienen en español; mostralos tal cual).

### 4. Pestaña "Historial de Movimientos" (`StockHistoryPanel.tsx`)

Props: `initialInsumoId?: string` (para llegar desde "ver historial" de una fila).
- **Filtros**: select de insumo (con "Todos"), select de tipo (Todos / Entrada / Salida / Ajuste / Devolución), fecha desde y fecha hasta (inputs `date`).
- Datos desde la vista `v_movimientos_stock`, ordenados por `created_at` desc, **`limit(300)`**. Mostrar un aviso "Mostrando los últimos 300 movimientos" si llegan 300.
- **Filtro de fechas**: `created_at` es un timestamp con zona horaria. Convertí las fechas elegidas a instantes en hora argentina (UTC-3 fijo): desde → `${desde}T00:00:00-03:00` con `.gte('created_at', ...)`; hasta → `${hasta}T23:59:59.999-03:00` con `.lte('created_at', ...)`.
- **Tabla**: fecha y hora (`new Date(created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`), insumo, tipo (badge), **cantidad con signo** (entrada/devolución `+`, salida `−`; en el **ajuste** mostrá la diferencia real `stock_nuevo − stock_anterior` con su signo), stock anterior → stock nuevo (con la unidad, `unidad_stock_nombre`), motivo y origen (`referencia_tipo`: `manual` → "Manual", `compra` → "Compra", otro → tal cual).
- Colores de badge de tipo (clases literales): entrada → esmeralda, salida → rojo (`error`), ajuste → ámbar, devolución → celeste (`sky`).
- Estado vacío: "No hay movimientos con estos filtros".
- Los movimientos **no se pueden editar ni borrar** (la base lo impide). Si algo está mal se corrige con un ajuste; aclaralo en un texto de ayuda.

## CONTRATO DE BASE DE DATOS (ya existe, no lo cambies ni lo repliques)

**Tabla `t_insumos`** (escritura directa con `insert`/`update` **solo desde `InsumoModal`**): `id uuid`, `nombre text NOT NULL`, `codigo text`, `categoria_id uuid`, `unidad_stock_id uuid NOT NULL`, `unidad_compra_id uuid`, `factor_compra numeric` (> 0, default 1; debe ser 1 si no hay unidad de compra), `stock_minimo numeric` (≥ 0), `ultimo_costo_compra numeric` (≥ 0), `observaciones text`, `activo boolean`, `created_at`. (**`stock` existe pero NO se escribe jamás.**)

**Vista `v_insumos_stock`** (solo lectura — usala para el listado): `id`, `nombre`, `codigo`, `categoria_id`, `categoria_nombre`, `unidad_stock_id`, `unidad_stock_nombre`, `unidad_compra_id`, `unidad_compra_nombre` (null si no tiene), `factor_compra`, `stock`, `stock_minimo`, `ultimo_costo_compra`, `observaciones`, `activo`, `created_at`, `bajo_minimo` (boolean), `stock_negativo` (boolean), `stock_en_unidad_compra`, `valor_stock`. Los `numeric` pueden llegar como string: usá `Number(...)`.

**Vista `v_movimientos_stock`** (solo lectura — historial): `id`, `insumo_id`, `insumo_nombre`, `unidad_stock_nombre`, `tipo` (`'entrada' | 'salida' | 'ajuste' | 'devolucion'`), `cantidad` (siempre ≥ 0, en unidad de stock), `stock_anterior`, `stock_nuevo`, `motivo`, `referencia_tipo`, `referencia_id`, `usuario_id`, `created_at`.

**Tablas de catálogo** (solo lectura desde tu pantalla): `t_conf_unidades_medida` (`id`, `nombre`; ordenar por `created_at`) y `t_conf_categorias_insumo` (`id`, `nombre`; ordenar por `nombre`).

**RPC de movimiento:**
```ts
const { data, error } = await supabase.rpc('registrar_movimiento_stock', {
  p_insumo_id: insumo.id,                 // uuid
  p_tipo: tipo,                           // 'entrada' | 'salida' | 'ajuste' | 'devolucion'
  p_cantidad: cantidad,                   // number > 0 — para entrada/salida/devolucion; null en ajuste
  p_stock_objetivo: stockReal,            // number >= 0 — solo para ajuste; null en los demás
  p_en_unidad_compra: enUnidadCompra,     // boolean: true si el usuario cargó la cantidad en la unidad de compra
  p_motivo: motivo || null,               // string | null (obligatorio para ajuste)
  p_referencia_tipo: 'manual',
  p_referencia_id: null,
  p_usuario_id: user?.id || null,         // useAuthStore().user?.id
});
// data: [{ movimiento_id, stock_anterior, stock_nuevo }]  (array de una fila; valores en unidad de STOCK)
```

## REGLAS OBLIGATORIAS (aprendidas de errores anteriores en este proyecto — no las ignores)

1. **El stock NO se calcula ni se escribe en el frontend.** Se lee de la vista y cambia solo por la RPC. Prohibido `insert`/`update`/`delete` sobre `t_movimientos_stock` y prohibido mandar `stock` a `t_insumos`. (Excepción permitida: la **vista previa en vivo** y las advertencias del modal de movimiento, que son solo informativas.)
2. **Fechas — usá `src/utils/dates.ts`**: `todayAR()` para "hoy" (`YYYY-MM-DD`) y `formatDateAR()` para fechas de calendario. **Prohibido** `new Date().toISOString().split('T')[0]` y `new Date('YYYY-MM-DD')`. Para los timestamps del historial usá `toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })`.
3. **Tailwind v4: clases completas y literales.** No armes clases por concatenación (`` `bg-${color}-500` `` no funciona); usá un objeto con las clases completas para las variantes. **No inventes clases**: `rounded-2.5xl` NO existe; usá `rounded-[1.75rem]`, `rounded-[2rem]` o `rounded-[2.5rem]`. Copiá las clases de SuppliersPage/SupplierModal.
4. **Evitá loops de renders**: un `useCallback`/`useEffect` no debe depender de un estado que él mismo actualiza. Los fetch van con `useCallback(..., [])` o dependencias primitivas estables, disparados desde un `useEffect`.
5. **Errores**: todo acceso a Supabase con `try/catch` o chequeo de `error` y `toast.error('Error al ...: ' + error.message)`. Botones de guardar con estado `loading` (evita doble envío).
6. **Formato**: montos con `Number(x).toLocaleString('es-AR', { minimumFractionDigits: 2 })` precedidos de `$`; cantidades/stock con `toLocaleString('es-AR', { maximumFractionDigits: 3 })`. Los inputs de cantidad usan `step="any"` (admiten decimales, ej. 2,5 litros).
7. Íconos: `<span className="material-symbols-outlined">nombre</span>`. No instales paquetes.
8. Componentes con `React.FC`, modales montados condicionalmente desde la página (`{isOpen && <XModal onClose={...} onSuccess={refetch} />}`).
9. No uses `service_role`, ni variables de entorno nuevas. El cliente se importa de `../lib/supabase`.
10. Cada botón de solo ícono lleva `title="..."`; cada input, su `<label>`.

## FUERA DE ALCANCE (no lo hagas)

Compras a proveedores, recetas o elaboración, consumo automático de insumos por trabajo, generación de PDFs, exportar a Excel, paginación real, y cualquier cambio en otras pantallas. Si algo de esto te parece necesario, **mencionalo al final** en vez de implementarlo.

## CÓMO VERIFICAR TU TRABAJO ANTES DE ENTREGAR

1. `npx tsc --noEmit` → sin errores. 2. `npm run build` → sin errores.
3. Checklist:
   - [ ] `/insumos` abre y el ítem "Insumos" aparece en el menú después de "Proveedores".
   - [ ] Crear "Papel A4 75g": stock = Hoja, compra = Resma, 1 Resma = 500 Hojas, mínimo 200, stock inicial 1000 → queda con stock 1.000 Hojas y "= 2 Resmas".
   - [ ] Una entrada de "2 Resmas" (cargada en unidad de compra) lleva el stock a 2.000 Hojas.
   - [ ] Una salida de 300 Hojas deja 1.700; una salida que lo deja bajo el mínimo muestra el badge "Stock bajo".
   - [ ] Un ajuste a 1.690 (motivo "Conteo") registra una diferencia de −10 en el historial. Sin motivo, el modal lo impide.
   - [ ] Una salida mayor al stock avisa (sin bloquear) y el insumo pasa a "Stock negativo".
   - [ ] Editar un insumo no deja cambiar la unidad de stock y nunca manda `stock` en el `update`.
   - [ ] "Ver historial" de una fila abre la pestaña Historial ya filtrada por ese insumo.
   - [ ] Los filtros de fecha del historial incluyen los movimientos del día "hasta" completo.
   - [ ] Un insumo sin unidad de compra guarda `unidad_compra_id = null` y `factor_compra = 1`.
4. Al final, listá los archivos creados/modificados y cualquier duda o decisión que hayas tomado por tu cuenta.
