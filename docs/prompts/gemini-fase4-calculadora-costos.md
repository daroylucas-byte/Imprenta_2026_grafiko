# Prompt para Gemini — Calculadora de costos internos + catálogo de Servicios

> Copiá TODO lo que está debajo de la línea y pegalo en Gemini. El backend (tablas, funciones y triggers de Supabase) ya está hecho y probado; **solo falta el frontend de estas dos piezas**. La integración de la calculadora dentro del modal de trabajos (`JobModal`) **NO es parte de tu tarea**: la hace otra persona después.

---

## ROL Y CONTEXTO

Sos un desarrollador frontend senior trabajando en **Grafiko**, un sistema de gestión para una imprenta (single-tenant, en uso de prueba). Stack: **React 19 + TypeScript + Vite + Tailwind CSS v4 + react-hook-form + react-hot-toast + Supabase JS v2**. La interfaz está en **español rioplatense** (voseo).

**El problema de negocio:** al armar un presupuesto, el dueño necesita una **calculadora** que lo ayude a saber cuánto le cuesta entregar un trabajo (papel, tintas, horas de diseño, tercerizados) y qué precio conviene poner. Ese desglose es **solo interno**: el cliente ve únicamente la línea con su precio final. El total del trabajo sigue saliendo solo de las líneas que ve el cliente.

Cada línea (ítem) de un presupuesto puede tener un **costeo**: una lista de **componentes** (insumos, servicios propios, servicios tercerizados y otros), un **margen %** sobre el costo, un **costo total** y un **precio sugerido** = `costo total × (1 + margen/100)`. Tu tarea son dos piezas:

1. **`CostCalculatorModal`**: el modal de la calculadora (se abre desde una línea del presupuesto).
2. **`ServiciosPage`**: el catálogo de servicios propios y tercerizados con su costo, más el margen por defecto.

**No escribas SQL ni toques `supabase/`**: el backend ya existe (ver "Contrato de base de datos").

## ANTES DE ESCRIBIR CÓDIGO, LEÉ ESTOS ARCHIVOS (referencia de estilo y patrones)

1. `src/pages/InsumosPage.tsx` y `src/components/InsumoModal.tsx` — listado + alta/edición con `react-hook-form`, tarjetas, buscador, baja lógica. **Copiá su estructura y sus clases** para `ServiciosPage`.
2. `src/components/StockMovementModal.tsx` — patrón de modal con selector de unidad (stock / compra) y **vista previa en vivo**: es el patrón para el modal de la calculadora.
3. `src/components/PurchaseModal.tsx` **si ya existe** (lista de ítems editable con combobox de insumos); si no existe, mirá `JobModal.tsx` (sección de ítems del trabajo).
4. `src/pages/ArcaConfigPage.tsx` — patrón de página de configuración con un formulario de un solo registro (para el margen por defecto).
5. `src/pages/ConfigDropdownPage.tsx` — mirá el bloque **"Servicios"** del menú lateral (con el link a `/configuracion/arca`): ahí va tu link nuevo.
6. `src/utils/dates.ts` — helpers de fechas (por si los necesitás).
7. `src/App.tsx` — para la ruta.

## QUÉ HAY QUE CONSTRUIR

Archivos nuevos:

| Archivo | Qué es |
|---|---|
| `src/components/CostCalculatorModal.tsx` | Calculadora de costos de una línea de presupuesto |
| `src/pages/ServiciosPage.tsx` | Página `/configuracion/servicios`: catálogo de servicios + margen por defecto |
| `src/components/ServicioModal.tsx` | Alta y edición de un servicio |

Archivos existentes que SÍ podés modificar (solo agregar):
- `src/App.tsx`: ruta protegida `/configuracion/servicios` con el mismo patrón que `/configuracion/arca` (`<Layout title="Servicios y Costeo"><ServiciosPage /></Layout>`), **antes** de la ruta comodín `/*`.
- `src/pages/ConfigDropdownPage.tsx`: agregar, **debajo** del link de "Facturación ARCA/AFIP" dentro del mismo bloque "Servicios", un `<Link to="/configuracion/servicios">` con el **mismo estilo** que el de ARCA, ícono `calculate` y texto "Servicios y Costeo". No toques nada más de ese archivo.

**No modifiques ningún otro archivo** (en particular **no toques `JobModal.tsx`**).

### 1. `ServiciosPage.tsx` (`/configuracion/servicios`)

- **Tarjeta "Margen por defecto"** arriba: muestra y permite editar `margen_defecto_pct` (número ≥ 0, ej. 40) con un botón "Guardar". Es una sola fila (`id = 1`) de `t_config_costeo`: leela con `.eq('id', 1).single()` y guardala con `.update({ margen_defecto_pct: n, updated_at: new Date().toISOString() }).eq('id', 1)` (es un `timestamptz`, ahí sí va `toISOString()`). Texto de ayuda: "Recargo sobre el costo que se propone al calcular un precio. Se puede cambiar en cada cálculo."
- **Catálogo de servicios** (tabla de `t_servicios`): nombre, tipo (badge "Propio" / "Tercerizado" con clases literales distintas), unidad (nombre de la unidad), **costo unitario** (`$` + "/ {unidad}"), estado. Buscador de texto libre (nombre, observaciones), pestañas Activos / Inactivos / Todos (default Activos), botón "Nuevo Servicio". Acciones por fila: **editar** y **dar de baja / reactivar** (`activo`, con `confirm()` al dar de baja). **No hay borrado físico.**
- Texto de ayuda: "Los servicios propios son horas o tareas del taller (diseño, mano de obra, máquina). Los tercerizados son trabajos que se hacen afuera (troquelado, encuadernado)."
- Estados de carga y vacío.

### 2. `ServicioModal.tsx`

Props: `servicioId?: string`, `onClose`, `onSuccess`. Campos: `nombre` (**obligatorio**), `tipo` (select `propio` → "Propio (taller)" / `tercerizado` → "Tercerizado (proveedor externo)", default `propio`), `unidad_id` (select desde `t_conf_unidades_medida`, orden `created_at`, opción "Sin unidad"; ayuda: "Ej: Hora, Unidad. Las unidades se administran en Configuración → Compras"), `costo_unitario` (número ≥ 0, `step="any"`, default 0), `observaciones`. Strings vacíos → `null` (excepto `nombre`). No mandes `id`, `created_at` ni `activo` en el insert. Con `servicioId`, cargar y hacer `update`; sin él, `insert`.

### 3. `CostCalculatorModal.tsx`

**Props:**
```ts
interface CostCalculatorModalProps {
  itemLabel: string;            // nombre de la línea, ej. "Folletos A5 x 1000" (solo para mostrar)
  cantidadItem: number;         // cantidad de la línea (para calcular el precio unitario sugerido)
  initialCosteo?: Costeo | null;// desglose ya guardado (para editar) o null si es nuevo
  onApply: (costeo: Costeo | null, precioTotalSugerido: number | null) => void; // null,null = quitar el desglose
  onClose: () => void;
}
interface CosteoComponente {
  tipo: 'insumo' | 'servicio' | 'tercerizado' | 'otro';
  ref_id?: string | null;       // id del insumo (t_insumos) o del servicio (t_servicios); null en "otro"
  nombre: string;
  unidad?: string | null;       // texto de la unidad, ej. "Resma", "Hora"
  cantidad: number;
  en_unidad_compra?: boolean;   // solo insumos
  costo_unitario: number;       // por la unidad elegida
  // (el servidor agrega subtotal y cantidad_stock: no los mandes ni los uses para guardar)
}
interface Costeo { margen_pct: number; componentes: CosteoComponente[]; }
```
(Al leer `initialCosteo` guardado, va a traer además `subtotal`, `cantidad_stock`, `costo_total` y `precio_sugerido`: ignoralos para el estado editable, recalculá en vivo.)

**Qué muestra y hace:**
- Encabezado: "Calculadora de costos" con `itemLabel` y `cantidadItem`. Aclaración fija: "Este desglose es solo interno: el cliente nunca lo ve."
- **Lista de componentes** editable. Para **agregar** un componente, cuatro botones/atajos: "+ Insumo", "+ Servicio propio", "+ Tercerizado", "+ Otro". Cada fila tiene, según el tipo:
  - **Insumo**: combobox con buscador sobre `v_insumos_stock` (activos, orden por nombre); al elegirlo, `ref_id` = id, `nombre` = nombre del insumo. Si tiene `unidad_compra_nombre`, selector "En: (•) {unidad_compra} ( ) {unidad_stock}" → `en_unidad_compra` (default: unidad de compra); si no, solo la de stock. `unidad` = nombre de la unidad elegida. **Costo unitario pre-cargado**: unidad de compra → `ultimo_costo_compra`; unidad de stock → `ultimo_costo_compra / factor_compra`. Editable.
  - **Servicio propio / Tercerizado**: select sobre `t_servicios` (activos, filtrando por `tipo` = `propio` o `tercerizado`, orden por nombre) con las unidades (`select('*, t_conf_unidades_medida(nombre)')`). Al elegirlo: `ref_id` = id, `nombre`, `unidad` = nombre de la unidad, **costo unitario pre-cargado** con `costo_unitario` del servicio. Editable (se puede ajustar por trabajo).
  - **Otro**: `nombre` libre (obligatorio), `unidad` libre opcional, costo libre. Sirve para flete, embalaje, etc.
  - En todos: **cantidad** (número ≥ 0, `step="any"`), **costo unitario** (≥ 0), y el **subtotal** de la fila en vivo (`cantidad × costo`). Botón quitar fila.
- **Margen %**: input numérico (≥ 0). Valor inicial: `initialCosteo.margen_pct` si viene; si no, el `margen_defecto_pct` de `t_config_costeo` (`.eq('id', 1).single()`). Texto: "Recargo sobre el costo".
- **Resumen en vivo** (destacado): **Costo total** (suma de subtotales) · **Precio sugerido** = `costo total × (1 + margen/100)` · **Precio unitario sugerido** = precio sugerido ÷ `cantidadItem` (si `cantidadItem > 0`) · **Ganancia** = precio sugerido − costo total. Estos números son una **vista previa**: el servidor los recalcula al guardar.
- Botones: **"Usar este precio"** (deshabilitado si no hay componentes o el costo total es 0) → llama `onApply(costeo, precioSugerido)` con el `Costeo` armado (solo los campos de la interfaz; `cantidad`, `costo_unitario` y `margen_pct` como `number`) y el precio total sugerido, **redondeado a 2 decimales**, y cierra. **"Quitar desglose"** (solo si había `initialCosteo`) → `onApply(null, null)`. **"Cancelar"** → `onClose()` sin cambios.
- Validación antes de aplicar: todo componente con `nombre` no vacío, `cantidad ≥ 0`, `costo_unitario ≥ 0`, y para insumos/servicios elegir uno de la lista (o, si el usuario prefiere, cambiar el tipo a "Otro").
- El modal **no guarda nada en la base por sí mismo**: solo devuelve el resultado con `onApply`. (Solo **lee** `v_insumos_stock`, `t_servicios` y `t_config_costeo`.)
- Capa: contenedor `fixed inset-0` con **`z-[130]`** (se abre encima del modal de trabajos).

## CONTRATO DE BASE DE DATOS (ya existe, no lo cambies ni lo repliques)

**Tabla `t_servicios`** (escritura directa desde `ServicioModal` y baja lógica desde la página): `id uuid`, `nombre text NOT NULL`, `tipo text` (`'propio' | 'tercerizado'`, default `'propio'`), `unidad_id uuid` (FK a `t_conf_unidades_medida`, nullable), `costo_unitario numeric` (≥ 0), `observaciones text`, `activo boolean`, `created_at`.

**Tabla `t_config_costeo`**: una sola fila, `id = 1`, con `margen_defecto_pct numeric` (≥ 0) y `updated_at`.

**Tabla `t_conf_unidades_medida`**: `id`, `nombre`, `created_at`. **Vista `v_insumos_stock`** (solo lectura): `id`, `nombre`, `codigo`, `unidad_stock_nombre`, `unidad_compra_nombre` (null si no tiene), `factor_compra`, `ultimo_costo_compra` (por unidad de **compra**), `activo`, entre otras.

Los `numeric` pueden llegar como string: usá `Number(...)`.

## REGLAS OBLIGATORIAS (aprendidas de errores anteriores en este proyecto — no las ignores)

1. **La calculadora es solo una ayuda visual: no persiste nada y el servidor recalcula.** No mandes ni confíes en `subtotal`, `costo_total` ni `precio_sugerido` como datos guardados. La única fuente de verdad de lo guardado es la base.
2. **Tailwind v4: clases completas y literales.** No armes clases por concatenación (`` `bg-${color}-500` `` no funciona); para variantes de color usá un objeto con las clases completas. **No inventes clases**: `rounded-2.5xl` NO existe; usá `rounded-[1.75rem]`, `rounded-[2rem]` o `rounded-[2.5rem]`. Copiá las clases de InsumosPage/StockMovementModal.
3. **Evitá loops de renders**: un `useCallback`/`useEffect` no debe depender de un estado que él mismo actualiza. Los fetch van con `useCallback(..., [])` o dependencias primitivas estables, disparados desde un `useEffect`. Al actualizar la lista de componentes usá el updater funcional (`setX(prev => ...)`) y keys **estables** (un id generado al agregar cada fila, no el índice), para no perder el foco al escribir.
4. **Errores**: todo acceso a Supabase con `try/catch` o chequeo de `error` y `toast.error('Error al ...: ' + error.message)`. Botones de guardar con estado `loading`.
5. **Formato**: montos con `Number(x).toLocaleString('es-AR', { minimumFractionDigits: 2 })` precedidos de `$`; cantidades con `toLocaleString('es-AR', { maximumFractionDigits: 3 })`; inputs numéricos con `step="any"`.
6. Íconos: `<span className="material-symbols-outlined">nombre</span>`. No instales paquetes.
7. Componentes con `React.FC`, modales montados condicionalmente desde la página. No uses `service_role` ni variables de entorno nuevas; el cliente se importa de `../lib/supabase`.
8. Cada botón de solo ícono lleva `title="..."`; cada input, su `<label>`.

## FUERA DE ALCANCE (no lo hagas)

Integrar la calculadora en `JobModal` o en cualquier otra pantalla, mostrar el margen del trabajo, descontar insumos del stock, PDFs, exportar a Excel, historial de versiones del desglose. Si algo te parece necesario, **mencionalo al final** en vez de implementarlo.

## CÓMO VERIFICAR TU TRABAJO ANTES DE ENTREGAR

1. Corré **`npm run build`** (NO `npx tsc --noEmit`: en este proyecto ese comando no revisa nada y siempre da "ok"). Debe pasar sin errores.
2. Checklist:
   - [ ] `/configuracion/servicios` abre desde el link nuevo de Configuración; se puede cambiar y guardar el margen por defecto.
   - [ ] Crear un servicio propio "Diseño gráfico" (Hora, $8.000) y uno tercerizado "Troquelado" (Unidad, $3.000); aparecen en la tabla con su badge; darlos de baja los saca de "Activos".
   - [ ] El `CostCalculatorModal` (podés montarlo temporalmente en una página tuya para probarlo, pero **no lo dejes montado en ningún archivo existente**) agrega un insumo con costo pre-cargado, un servicio con su costo y un componente "Otro"; el resumen muestra costo total, precio sugerido, precio unitario y ganancia coherentes con el margen.
   - [ ] Con un insumo que tiene unidad de compra y factor 500, alternar entre unidad de compra y de stock cambia el costo pre-cargado (`ultimo_costo_compra` vs `ultimo_costo_compra / 500`).
   - [ ] "Usar este precio" llama `onApply` con un `Costeo` limpio y el precio total; "Quitar desglose" llama `onApply(null, null)`; cancelar no llama nada.
   - [ ] Escribir en los inputs no pierde el foco.
3. Al final, listá los archivos creados/modificados, cómo probaste el modal y cualquier duda o decisión que hayas tomado por tu cuenta.
