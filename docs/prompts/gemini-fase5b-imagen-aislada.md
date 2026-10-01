# Prompt para Gemini — Imagen Suelta (generación aislada de imagen) dentro de Campañas

> Copiá TODO lo que está debajo de la línea y pegalo en Gemini. El backend (tabla, vista, Edge Function en Supabase) **ya está hecho, desplegado y probado**; solo falta el frontend. No tenés que escribir SQL ni crear Edge Functions.

---

## ROL Y CONTEXTO

Sos un desarrollador frontend senior trabajando en **Grafiko**, un sistema de gestión para una imprenta (single-tenant, en uso de prueba). Stack: **React 19 + TypeScript + Vite + React Router v7 + Tailwind CSS v4 + react-hook-form + react-hot-toast + Supabase JS v2**. Interfaz en **español rioplatense** (voseo).

**El problema de negocio:** ya existe `src/pages/ClientCampaignsPage.tsx` (ruta `/campanas`) con este flujo: buscar/seleccionar un cliente → sección "Identidad Visual" (subir imágenes de referencia, botón "Analizar Identidad") → listado y creación de **campañas de 30 días** (plan + posts semana a semana + imagen por post). **Ese flujo entero queda tal cual está, sin tocarlo.**

Lo que falta es un módulo **más simple y directo**, al lado de "Campañas": generar **una imagen puntual** (no atada a ninguna campaña ni post) llenando un formulario con medidas, ubicación del logo, información de contexto y textos obligatorios, y que salgan **3 alternativas** de imagen para elegir/descargar. Tu tarea es agregar esto como una **pestaña nueva** en la misma página, sin romper la pestaña de Campañas.

## ANTES DE ESCRIBIR CÓDIGO, LEÉ ESTE ARCHIVO ENTERO

`src/pages/ClientCampaignsPage.tsx` — es el único archivo que vas a modificar. Fijate en particular:
- El buscador/selector de cliente (`selectedCliente`) y la sección de Identidad Visual (`fetchIdentidadYAnalisis`, subida de imágenes): **no los tocás**, van arriba de las pestañas, visibles siempre que haya un cliente elegido.
- `fetchSaldo` / el estado `saldo` (lee `t_saldo_marketing`): reusalo tal cual para el nuevo botón de generar.
- `handleEdgeFunctionError` (manejo de errores de `supabase.functions.invoke`, incluido el parseo del body de error de `FunctionsHttpError`): reusalo tal cual para la llamada nueva.
- El patrón general de `supabase.functions.invoke('nombre-funcion', { body: {...} })` ya usado ahí (`analizar-identidad-cliente`, `generar-campana`, `generar-semana-campana`, `generar-imagen-campana`): la función nueva se llama igual.
- Las clases Tailwind y componentes visuales ya usados en esa misma página (tarjetas, badges, inputs, botones) — **copiá ese mismo estilo**, no inventes uno nuevo.

Si necesitás un ejemplo de lista dinámica editable (agregar/quitar líneas de texto), mirá cómo `PurchaseModal.tsx` o `JobModal.tsx` manejan sus listas de ítems (array de objetos con un `rowId` generado, nunca el índice como key).

## QUÉ HAY QUE CONSTRUIR

Dentro de `ClientCampaignsPage.tsx`, cuando hay un cliente seleccionado (después de la sección de Identidad Visual, que queda igual), agregar un **selector de pestañas** con dos opciones:

- **"Campañas"** (por defecto): todo lo que ya existe hoy en la página, sin cambios.
- **"Imagen Suelta"** (nueva): el formulario y el historial descriptos abajo.

No crees ninguna ruta nueva ni archivo nuevo — todo vive adentro de esta misma página, en un bloque condicional según la pestaña activa.

### Pestaña "Imagen Suelta"

**1. Formulario de generación**

| Campo | Cómo se ve | Validación |
|---|---|---|
| Medidas | Selector con presets: "Post cuadrado (1080×1080)", "Story / Reel (1080×1920)", "Post horizontal (1200×628)", "Banner web (1600×400)", "Personalizado…". Si elige "Personalizado", mostrar dos inputs numéricos (Ancho px / Alto px). | Ancho y alto > 0 |
| Ubicación del logo | Select: "Esquina superior izquierda", "Esquina superior derecha", "Esquina inferior izquierda", "Esquina inferior derecha", "Centrado", "Sin logo". | Obligatorio (ver valores exactos en el contrato) |
| Información de la imagen | Textarea: de qué se trata la imagen, contexto, tema. | Obligatorio, no vacío |
| Textos obligatorios | Lista dinámica de inputs de texto de una sola línea ("Agregar texto" / quitar por línea). Pueden ser 0 (sin textos obligatorios) o varios. | Cada línea no vacía si existe |

Botón **"Generar 3 Alternativas (3.750 créditos)"**:
- Deshabilitado si `saldo < 3750` (mismo patrón de `saldo` ya usado en la página) o si "Información de la imagen" está vacía.
- Al confirmar: `toast.loading('Generando 3 alternativas con Gemini... esto puede demorar un minuto, se generan de a una.')`, llama a la Edge Function (ver contrato), y al responder muestra las imágenes obtenidas (pueden ser menos de 3 si alguna falló: mostrá un aviso si `generadas < solicitadas`, ej. "Se generaron 2 de 3 alternativas"), actualiza `saldo` (`fetchSaldo()`), y refresca el historial.
- Usá `handleEdgeFunctionError` para los errores, igual que el resto de la página.

**2. Resultado de la última generación**

Mientras no se cierre/limpie el formulario, mostrar las imágenes recién generadas en una grilla (hasta 3), cada una con: miniatura (`<img>`, `object-cover`, bordes redondeados), y links "Ver" (abre `imagen_url` en pestaña nueva) / "Bajar" (`<a href={url} download>`).

**3. Historial**

Debajo, una lista/grilla de generaciones anteriores **de ese cliente** (lee la vista `v_imagenes_aisladas_cliente` filtrando por `cliente_id`, orden `created_at` descendente, límite ~20). Por cada generación: fecha, medidas (`{ancho_px}×{alto_px}`), ubicación del logo (en texto legible), "Información" (truncada a ~80 caracteres), textos obligatorios (como chips, si hay), y las miniaturas de `imagenes_url` (array) con los mismos links Ver/Bajar. Estado vacío: "Todavía no se generaron imágenes sueltas para este cliente."

## CONTRATO DE BASE DE DATOS Y BACKEND (ya existe, no lo repliques ni lo cambies)

**Tabla `t_imagenes_aisladas_cliente`** (no se escribe directo desde el frontend, la llena la Edge Function):
`id uuid`, `cliente_id uuid`, `ancho_px integer`, `alto_px integer`, `logo_ubicacion text` (uno de: `'superior_izquierda' | 'superior_derecha' | 'inferior_izquierda' | 'inferior_derecha' | 'centro' | 'sin_logo'`), `informacion text`, `textos_obligatorios jsonb` (array de strings), `imagenes_url jsonb` (array de strings, las URLs públicas generadas), `usuario_id uuid`, `created_at timestamptz`.

**Vista `v_imagenes_aisladas_cliente`** (solo lectura, para el historial): mismas columnas + `cliente_nombre text`.

**Edge Function `generar-imagen-aislada`** (invocar con `supabase.functions.invoke`):

```ts
// body que mandás:
{
  cliente_id: string;            // uuid del cliente seleccionado
  ancho_px: number;
  alto_px: number;
  logo_ubicacion: 'superior_izquierda' | 'superior_derecha' | 'inferior_izquierda' | 'inferior_derecha' | 'centro' | 'sin_logo';
  informacion: string;
  textos_obligatorios: string[]; // puede ser []
  usuario_id: string | null;
}

// respuesta ok (data):
{
  ok: true;
  id: string;             // id de la fila en t_imagenes_aisladas_cliente
  imagenes_url: string[]; // 1 a 3 URLs públicas (bucket 'marketing')
  generadas: number;      // cuántas se lograron generar
  solicitadas: number;    // siempre 3
}
// o, si falla por completo: { error: string } con status 400/404/500 (usar el patrón de handleEdgeFunctionError)
```

La función **ya descuenta 3.750 créditos del wallet** (`t_saldo_marketing`, compartido con el resto de Grafiko) antes de llamar a Gemini — **no descuentes nada desde el frontend**, solo mostrá el costo en el botón y refrescá `saldo` después con `fetchSaldo()`.

## REGLAS OBLIGATORIAS (aprendidas de errores anteriores en este proyecto — no las ignores)

1. **No tocar la pestaña "Campañas"**: toda la lógica, estado y JSX que ya existen deben seguir funcionando exactamente igual. Si agregás estado nuevo (ej. `activeTab`), que no interfiera con los `useEffect`/`useCallback` existentes.
2. **Tailwind v4: clases completas y literales.** No armes clases por concatenación de variables; no inventes clases (`rounded-2.5xl` no existe — usá `rounded-[1.75rem]`/`rounded-[2rem]`/`rounded-[2.5rem]`, ya usadas en el resto del archivo).
3. **Evitá loops de renders**: cualquier `useCallback`/`useEffect` nuevo no debe depender de un estado que él mismo actualiza (ya hubo un bug así en esta misma página con `fetchCampanas`/`selectedCampana`: usá updaters funcionales `setX(prev => ...)` si hace falta).
4. **Listas dinámicas** (textos obligatorios): cada línea con un `rowId` generado al agregarla (no el índice) como `key`, para no perder el foco al tipear.
5. **Montos y números**: créditos como enteros (`3.750`, sin decimales); medidas en píxeles sin decimales.
6. Íconos: `<span className="material-symbols-outlined">nombre</span>`. No instales paquetes nuevos.
7. Todo acceso a Supabase con manejo de error y `toast`. Botones de acción con estado `loading` propio mientras están en vuelo.
8. No uses `service_role` ni variables de entorno nuevas; el cliente ya se importa de `../lib/supabase` en este archivo.

## FUERA DE ALCANCE (no lo hagas)

- No crees rutas nuevas, ni páginas nuevas, ni Edge Functions nuevas.
- No agregues "elegir la alternativa favorita" ni edición de las imágenes generadas (recortar, texto editable sobre la imagen, etc.) — es sacar 3 alternativas y listo, el usuario las baja y las usa afuera.
- No toques `t_identidad_visual_cliente` ni el flujo de "Analizar Identidad" existente.
- No agregues paginado al historial (un límite fijo de ~20 alcanza por ahora).
- Si te parece que falta algo (ej. poder borrar una generación vieja), **mencionalo al final** en vez de implementarlo.

## CÓMO VERIFICAR TU TRABAJO ANTES DE ENTREGAR

1. Corré **`npm run build`** (NO `npx tsc --noEmit`: en este proyecto ese comando no revisa nada y siempre da "ok" — el `tsconfig.json` raíz tiene `"files": []`). Debe pasar sin errores y sin que el bundle principal crezca de forma desmedida (si hace falta, no agregues dependencias nuevas).
2. Checklist:
   - [ ] La pestaña "Campañas" se ve y funciona exactamente igual que antes de tu cambio.
   - [ ] Con un cliente elegido, la pestaña "Imagen Suelta" muestra el formulario completo; "Personalizado" en Medidas muestra los inputs de ancho/alto.
   - [ ] El botón de generar está deshabilitado con saldo insuficiente o sin "Información" cargada, y muestra el costo (3.750).
   - [ ] (Si podés probarlo con credenciales reales) Generar una imagen de prueba: aparecen hasta 3 miniaturas con Ver/Bajar, el saldo baja, y la generación aparece en el historial de abajo.
   - [ ] El historial lee de `v_imagenes_aisladas_cliente` filtrado por el cliente actual, más nuevo primero.
3. Al final, listá qué modificaste en el archivo, cómo lo probaste, y cualquier duda o decisión que hayas tomado por tu cuenta (ej. nombres exactos de los presets de medidas).
