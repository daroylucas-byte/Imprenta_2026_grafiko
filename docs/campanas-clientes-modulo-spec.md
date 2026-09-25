# Spec: Módulo "Campañas de Marketing IA para Clientes"

> Documento de referencia para extraer este módulo a un **proyecto nuevo e independiente**.
> Origen: extraído de Grafiko (sistema de gestión de imprenta) el 2026-07-11, donde convivía
> como un módulo adicional junto al negocio principal (kanban de trabajos, facturación, etc.).
> Este documento describe el módulo tal como fue diseñado e implementado ahí, más las
> decisiones de diseño y qué habría que generalizar para que funcione como producto propio.

---

## 1. Qué hace el módulo

Una agencia/negocio (en el caso original, una imprenta) usa este módulo para generar
**campañas de marketing de 30 días con IA en nombre de sus propios clientes** — no es
marketing del negocio mismo, es un servicio que el negocio le presta a cada uno de sus
clientes.

Flujo de uso:

1. El usuario selecciona (o crea) un **cliente**.
2. Sube imágenes de referencia de ese cliente (logo, publicidades viejas) para que la IA
   analice y "aprenda" su identidad visual (paleta, tipografía, tono).
3. Crea una **campaña** para ese cliente: nombre, fechas, objetivo, plataformas, público
   objetivo, meta que el cliente quiere lograr, contexto libre.
4. La IA genera un **plan estratégico** de 4 semanas (resumen + un eje temático por semana).
5. Semana a semana (bajo demanda, no las 4 juntas), la IA genera **5-7 posts** por semana:
   plataforma, tipo de contenido, hora sugerida, hook, copy, CTA, hashtags, objetivo del post.
6. El usuario aprueba/rechaza cada post.
7. Por cada post aprobado (o cualquiera), puede generar una **imagen** que respeta la
   identidad visual analizada del cliente.

Todo el consumo de IA se paga con un **wallet de créditos** (saldo prepago, sin integración
de pago real — carga manual desde la UI).

---

## 2. Decisiones de diseño (el "por qué", no solo el "qué")

Estas decisiones fueron tomadas explícitamente durante el desarrollo y vale la pena
preservarlas en el proyecto nuevo:

- **Estructura de 3 niveles (Campaña → Posts por semana → Imagen por post)**, no una
  campaña con 4-8 "piezas" sueltas de texto. El primer diseño era más simple (piezas sueltas,
  calcado de un módulo de promociones genéricas) pero no alcanzaba para representar un plan
  de contenido real de agencia con calendario, pilares semanales y variedad de formatos por
  plataforma. Se descartó ese diseño simple a favor de este de 3 niveles.

- **Generar por semana, no el mes completo de una sola vez.** Pedirle a un LLM que genere
  30 días de contenido detallado en una sola respuesta es una respuesta larga, con alto
  riesgo de que se corte a mitad o venga con JSON mal formado. En cambio: una llamada chica
  para el plan de 4 pilares (resumen + eje temático por semana, sin detalle), y después una
  llamada separada por cada semana bajo demanda (5-7 posts, respuesta acotada y confiable).

- **El plan de pilares es prerrequisito de los posts.** No se puede generar los posts de una
  semana si la campaña todavía no tiene `pilares_semanales` — sin eso no hay contexto
  temático de esa semana. La función de generar semana devuelve error 400 explícito pidiendo
  generar el plan primero.

- **Protección simple contra duplicados**: no se puede volver a generar posts de una semana
  que ya los tiene (hay que borrarlos a mano primero). Es una guarda mínima, no un sistema de
  versionado de contenido — deliberadamente simple para la primera versión.

- **La meta cuantificable la escribe el usuario, nunca la IA.** No hay integración real con
  redes sociales (Meta API, TikTok API, etc.) detrás de este módulo, así que no hay forma de
  sustentar métricas de resultado esperado con datos reales. Pedirle a la IA que invente
  "vas a lograr +500 seguidores" sería una promesa sin base. El campo existe en el formulario
  como texto libre que completa el usuario, informativo únicamente.

- **La fecha calendario exacta de cada post no se calcula.** El modelo devuelve un día de la
  semana en texto ("Lunes", "Martes"...) pero no se resuelve contra `fecha_inicio` de la
  campaña para obtener una fecha real. Es una limitación consciente, no un bug — quedó
  documentada como pendiente. El frontend muestra el día de texto (prefijado al copy entre
  corchetes, ej. `[Lunes] contenido del post...`) en vez de una fecha real.

- **Identidad visual por cliente, no singleton.** A diferencia de un módulo de marketing
  para el negocio propio (donde la identidad visual es una sola, del negocio), acá cada
  cliente tiene su propia identidad visual analizada por separado, reutilizada entre todas
  sus campañas.

- **Patrón de prompt para generación de imagen**: las reglas de identidad visual van como
  bloque estructurado **al principio** del prompt, marcado como "obligatorias, prioridad #1"
  — no diluidas en un párrafo al final. Los modelos de imagen priorizan mejor las
  restricciones de estilo cuando están adelante y claramente delimitadas. Reforzar esto fue
  necesario porque una primera versión del prompt (con la identidad como nota al final) no
  reflejaba bien el estilo de marca en la imagen generada.

- **Reglas de idioma explícitas en el prompt de imagen.** Los modelos de imagen multimodales
  pueden "filtrarse" con acentos o caracteres de otros idiomas al generar texto dentro de la
  imagen (se observó, en el proyecto original, un logo generado con una tilde portuguesa en
  vez de la ortografía correcta en español). Se agregó una sección final de reglas explícitas:
  español rioplatense/argentino, alfabeto español únicamente (con "ñ"), prohibición de
  diacríticos de otros idiomas, y el nombre de marca deletreado exactamente como debe
  reproducirse.

---

## 3. Schema de base de datos (PostgreSQL / Supabase)

### 3.1 `clientes` (o equivalente — en el proyecto original era una tabla ya existente)

Columnas mínimas usadas por este módulo: `id UUID PK`, `razon_social TEXT` (o `nombre`).
Si el proyecto nuevo no tiene un módulo de clientes propio, **esta es la primera pieza a
construir** — todo lo demás cuelga de `cliente_id`.

### 3.2 Identidad visual por cliente

```sql
CREATE TABLE identidad_visual_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  imagen_url TEXT NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_identidad_visual_cliente_cliente_id ON identidad_visual_cliente(cliente_id);

-- Resultado del análisis, uno por cliente (no singleton global)
CREATE TABLE analisis_identidad_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  estilo_descripcion TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Campañas (Nivel 1) y Posts (Nivel 2)

```sql
CREATE TABLE campanas_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre_campana TEXT NOT NULL,
  fecha_inicio DATE,
  fecha_fin DATE,
  objetivo TEXT CHECK (objetivo IN ('awareness', 'leads', 'ventas', 'engagement', 'trafico')),
  meta_cuantificable TEXT,      -- texto libre del USUARIO, nunca generado por IA
  plataformas TEXT[] DEFAULT '{}',
  publico_objetivo TEXT,
  contexto_extra TEXT,
  pilares_semanales JSONB,      -- [{ "semana": 1, "eje": "...", "enfoque": "..." }, ...] x4. NULL hasta generar el plan.
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activa', 'archivada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campanas_cliente_cliente_id ON campanas_cliente(cliente_id);

CREATE TABLE campana_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id UUID NOT NULL REFERENCES campanas_cliente(id) ON DELETE CASCADE,
  semana INT NOT NULL CHECK (semana BETWEEN 1 AND 4),
  fecha DATE,                    -- siempre NULL en la implementación actual, ver limitación conocida
  plataforma TEXT,
  tipo_contenido TEXT,           -- 'carousel' | 'reel' | 'video' | 'imagen' | 'story'
  hora_sugerida TEXT,
  hook TEXT,
  copy TEXT,                     -- puede venir prefijado "[Lunes] ..." con el día de texto
  cta TEXT,
  hashtags TEXT[],
  objetivo_post TEXT,            -- 'awareness' | 'engagement' | 'conversion' | 'retencion'
  imagen_url TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campana_posts_campana_id ON campana_posts(campana_id);
CREATE INDEX idx_campana_posts_campana_semana ON campana_posts(campana_id, semana);
```

### 3.4 Wallet de créditos (billetera de consumo de IA)

En el proyecto original este wallet era **compartido** con otro módulo de marketing
preexistente del negocio. En un proyecto nuevo e independiente, este sería el único
consumidor — se puede simplificar, pero la mecánica atómica vale la pena mantenerla.

```sql
CREATE TABLE saldo_marketing (
  id INT PRIMARY KEY DEFAULT 1,
  saldo NUMERIC NOT NULL DEFAULT 0,
  CHECK (id = 1)  -- singleton
);

CREATE TABLE transacciones_marketing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'carga',
    'analizar_identidad_cliente',
    'generar_campana',
    'generar_semana_campana',
    'generar_imagen_campana'
  )),
  monto NUMERIC NOT NULL,        -- negativo para consumo, positivo para carga
  descripcion TEXT,
  usuario_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

RPCs necesarias (transacciones atómicas — evitar hacer el `UPDATE saldo` + `INSERT
transaccion` como dos pasos separados desde el cliente, para que no queden desincronizados
si algo falla a mitad de camino):

```sql
-- Carga manual de saldo (sin integración de pago real)
CREATE OR REPLACE FUNCTION cargar_saldo_marketing(
  p_monto NUMERIC,
  p_descripcion TEXT,
  p_usuario_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_saldo NUMERIC;
BEGIN
  UPDATE saldo_marketing SET saldo = saldo + p_monto WHERE id = 1
    RETURNING saldo INTO v_nuevo_saldo;

  INSERT INTO transacciones_marketing (tipo, monto, descripcion, usuario_id)
  VALUES ('carga', p_monto, p_descripcion, p_usuario_id);

  RETURN v_nuevo_saldo;
END;
$$;

-- Descuento atómico, usado por TODAS las Edge Functions antes de llamar a la IA
CREATE OR REPLACE FUNCTION descontar_saldo_marketing(
  p_monto NUMERIC,
  p_tipo TEXT,
  p_descripcion TEXT,
  p_usuario_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_actual NUMERIC;
  v_nuevo_saldo NUMERIC;
BEGIN
  SELECT saldo INTO v_saldo_actual FROM saldo_marketing WHERE id = 1 FOR UPDATE;

  IF v_saldo_actual < p_monto THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  UPDATE saldo_marketing SET saldo = saldo - p_monto WHERE id = 1
    RETURNING saldo INTO v_nuevo_saldo;

  INSERT INTO transacciones_marketing (tipo, monto, descripcion, usuario_id)
  VALUES (p_tipo, -p_monto, p_descripcion, p_usuario_id);

  RETURN v_nuevo_saldo;
END;
$$;
```

> Nota: en el proyecto original el descuento se hace **antes** de llamar a Gemini (no
> después). Es una decisión consciente de simplicidad: si la llamada a Gemini falla después
> de descontar, el crédito se pierde. Para un producto real, evaluar mover el descuento
> a *después* de una respuesta exitosa de la IA, o agregar un mecanismo de reembolso en el
> `catch` de cada Edge Function.

### 3.5 RLS

En el proyecto original, todas las tablas tienen la policy más simple posible (acceso
binario autenticado/no autenticado, sin distinción de roles):

```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to authenticated" ON <tabla>
FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

**Para un proyecto multi-tenant** (varios negocios distintos usando el mismo backend, cada
uno viendo solo sus propios clientes/campañas) esto **no alcanza** — habría que agregar una
columna `owner_id`/`tenant_id` en `clientes` (o en `campanas_cliente` directamente) y policies
reales `USING (owner_id = auth.uid())`. Esto es la generalización más importante a resolver
si el proyecto nuevo apunta a ser un SaaS multi-cliente en vez de un sistema interno de un
solo negocio.

### 3.6 Storage

Bucket público de Supabase Storage (ej. `marketing`), con policies: lectura pública, escritura
solo `authenticated`. Rutas usadas:

- `identidad-clientes/{cliente_id}/{timestamp}-{random}.{ext}` — imágenes de referencia subidas.
- `campanas/{post_id}-{timestamp}.{ext}` — imágenes generadas por post.

---

## 4. Backend: Edge Functions (Supabase, Deno)

Las 4 funciones siguen el mismo esqueleto: CORS + manejo de `OPTIONS`, parseo de body,
validación mínima, descuento de saldo, llamada a Gemini, guardado en la tabla
correspondiente. Usan `SUPABASE_SERVICE_ROLE_KEY` (nunca exponer esa key al cliente — solo
vive dentro de la Edge Function).

### 4.1 Costos (créditos) usados en la implementación original

| Función | Costo | Modelo Gemini |
|---|---|---|
| `analizar-identidad-cliente` | 500 | `gemini-3.1-flash-image` (multimodal, análisis) |
| `generar-campana` | 600 | `gemini-2.5-flash` (texto) |
| `generar-semana-campana` | 600 | `gemini-2.5-flash` (texto) |
| `generar-imagen-campana` | 1250 | `gemini-3.1-flash-image` (generación de imagen) |

> Importante: los nombres de modelo de Gemini cambian con el tiempo y según la cuenta/API key
> (cuentas distintas pueden tener acceso a versiones distintas). Antes de asumir un nombre de
> modelo, correr `GET https://generativelanguage.googleapis.com/v1beta/models?key=<key>` para
> confirmar qué hay disponible.

### 4.2 `analizar-identidad-cliente`

**Input**: `{ cliente_id: string, usuario_id: string | null }`

1. Trae hasta 5 imágenes de `identidad_visual_cliente` de ese cliente (falla 400 si no hay
   ninguna).
2. Descarga cada imagen y la convierte a base64 (`inlineData` para Gemini multimodal).
3. Descuenta el costo.
4. Llama a Gemini con un prompt que pide un párrafo de texto plano describiendo: paleta de
   colores (con hex si es posible), tipografía sugerida, tono, elementos gráficos recurrentes.
5. Guarda el resultado con `upsert` en `analisis_identidad_cliente` (`onConflict: cliente_id`).

### 4.3 `generar-campana`

**Input**: `{ campana_id: string, usuario_id: string | null }`

1. Trae la campaña + `razon_social` del cliente (join).
2. Trae el análisis de identidad visual del cliente si existe (opcional — si no existe, el
   prompt avisa a la IA que use un tono profesional genérico).
3. Descuenta el costo.
4. Prompt: le da a Gemini todos los campos de la campaña (objetivo, fechas, plataformas,
   público, meta del usuario, contexto libre) y pide **solo** un JSON chico:
   ```json
   {
     "resumen": "...",
     "pilares": [
       { "semana": 1, "eje": "...", "enfoque": "..." },
       { "semana": 2, "eje": "...", "enfoque": "..." },
       { "semana": 3, "eje": "...", "enfoque": "..." },
       { "semana": 4, "eje": "...", "enfoque": "..." }
     ]
   }
   ```
   El prompt sugiere una progresión estándar de agencia (Semana 1 Awareness/Introducción →
   Semana 2 Engagement/Educación → Semana 3 Conversión/Oferta → Semana 4 Retención/Comunidad),
   adaptable según el objetivo real de la campaña.
5. Parsea la respuesta (limpiando ```` ```json ```` si el modelo lo agrega igual), guarda
   `pilares_semanales`, pone `estado = 'activa'`, y agrega el resumen al final de
   `contexto_extra` con un marcador `[Resumen generado por IA]: ...` (concatenado, no
   reemplaza lo que el usuario ya había escrito).

### 4.4 `generar-semana-campana`

**Input**: `{ campana_id: string, semana: number (1-4), usuario_id: string | null }`

1. Trae la campaña, busca el pilar de esa semana dentro de `pilares_semanales` — si no existe
   (la campaña no tiene plan generado todavía), error 400 explícito.
2. Chequea que esa semana no tenga posts ya generados — si tiene, error 400 (protección
   simple, sin soporte de regenerar automáticamente).
3. Trae identidad visual del cliente (opcional).
4. Descuenta el costo.
5. Prompt: le pasa el eje/enfoque de esa semana puntual + plataformas + público + contexto,
   pide 5-7 posts en JSON array, cada uno con: `dia` (texto, ej. "Lunes"), `plataforma`,
   `tipo_contenido`, `hora_sugerida`, `hook`, `copy`, `cta`, `hashtags[]`, `objetivo_post`.
6. Inserta los posts en `campana_posts` con `campana_id`/`semana` correspondiente, `fecha:
   null`, y el `copy` prefijado con `[${dia}] ` si vino el día.

### 4.5 `generar-imagen-campana`

**Input**: `{ post_id: string, usuario_id: string | null }`

1. Trae el post con join anidado a la campaña y al cliente (para nombre de marca).
2. Trae identidad visual del cliente.
3. Descuenta el costo.
4. Prompt: bloque de identidad visual obligatoria al principio (ver sección 2, patrón de
   prompt), después el contenido del post (hook, copy, CTA, hashtags como contexto de tema),
   detección de formato según `tipo_contenido` (`story`/`reel` → vertical 9:16, resto →
   cuadrado 1:1), y al final las reglas de idioma español.
5. Extrae la imagen de la respuesta (`candidates[0].content.parts[].inlineData.{mimeType,
   data}`, base64), la sube al bucket, actualiza `imagen_url` en el post.

---

## 5. Frontend (referencia, no acoplado a ningún framework específico salvo lo indicado)

Implementación original: React 19 + TypeScript + React Hook Form + react-hot-toast +
Tailwind CSS v4, cliente de Supabase JS v2 llamado directo desde la página (sin capa de
`services/`).

### 5.1 Flujo de pantalla (una sola página, con estados condicionales)

1. **Sin cliente seleccionado**: buscador/selector de cliente (dropdown con filtro de texto).
2. **Con cliente seleccionado**:
   - Panel de **identidad visual**: grid de miniaturas subidas, botón de eliminar por imagen,
     input de subida múltiple, botón "Analizar Identidad" (deshabilitado sin imágenes o sin
     saldo suficiente), card con el resultado del análisis si existe.
   - Panel de **campañas del cliente**: listado con badge de estado (`borrador`/`activa`/
     `archivada`), botón "+" para abrir el formulario de nueva campaña.
   - **Formulario de nueva campaña**: nombre, fechas, objetivo (select), meta cuantificable
     (texto libre con placeholder aclarando que la completa el usuario), plataformas
     (checkboxes multi-select), público objetivo, contexto extra (textarea grande). Al
     enviar: inserta la fila (`estado: 'borrador'`) y dispara inmediatamente la generación del
     plan (`generar-campana`) en el mismo flujo, con manejo de error que deja la campaña en
     borrador con botón de reintento si la IA falla.
   - **Detalle de campaña seleccionada**: si no tiene `pilares_semanales`, botón "Generar plan
     de campaña". Si los tiene: resumen ejecutivo destacado (extraído del contexto_extra por
     el marcador), 4 tabs (una por semana) mostrando eje/enfoque del pilar y, si ya tiene
     posts, la lista de posts de esa semana con: badges de plataforma/tipo/día, hook, copy
     completo, CTA, hashtags, estado, botones aprobar/rechazar, botón generar/regenerar imagen
     con preview + links ver/bajar si ya existe.

### 5.2 Bugs encontrados durante el desarrollo (evitarlos desde el diseño en el proyecto nuevo)

- **Loop infinito por dependencia circular en `useCallback`/`useEffect`**: una función de
  fetch (`fetchCampanas`) tenía como dependencia un estado que ella misma actualizaba
  (`selectedCampana`). Cada actualización de estado recreaba la función, que era dependencia
  de un `useEffect`, que la volvía a ejecutar, que volvía a actualizar el estado — ciclo
  infinito de requests a la base de datos. **Regla general a aplicar en el proyecto nuevo**:
  cualquier `useCallback` que internamente llama a un setter de estado no debe tener ese mismo
  estado en su array de dependencias; usar el updater funcional (`setEstado(prev => ...)`) en
  su lugar para no necesitar leer el valor actual desde el closure.
- **Clases CSS arbitrarias inválidas silenciosas** (Tailwind v4): usar una utilidad que no
  existe en la escala del `@theme` configurado (ej. `rounded-2.5xl` sin esa escala definida)
  no rompe el build ni tira error — simplemente no genera CSS para esa clase, y el elemento
  pierde ese estilo sin avisos. Vale la pena, en el proyecto nuevo, definir explícitamente en
  el theme las escalas de radius/spacing no estándar que se vayan a usar repetidamente, en vez
  de confiar en valores arbitrarios sueltos por todo el código.

---

## 6. Qué generalizar/cambiar para un proyecto independiente

Checklist de lo que en Grafiko estaba acoplado al contexto de "imprenta con un solo negocio"
y habría que revisar si el proyecto nuevo apunta a ser multi-tenant o un producto más genérico:

- [ ] **Multi-tenancy real**: agregar `owner_id`/`tenant_id` y policies RLS reales si va a
      haber más de un negocio/agencia usando el mismo backend (ver sección 3.5).
- [ ] **Wallet por tenant**, no singleton global — si hay más de un negocio, cada uno necesita
      su propio saldo, no uno compartido con `id = 1`.
- [ ] **Autenticación/roles**: en Grafiko, RLS es binaria (autenticado sí/no). Un producto
      SaaS necesita como mínimo aislar los datos por cuenta.
- [ ] **Integración de pago real** para cargar saldo (Grafiko usa carga manual sin gateway).
- [ ] **Cálculo de fecha real por post** (limitación conocida, nunca resuelta en el original)
      — si el producto nuevo quiere exportar a un calendario real o integrar con un
      programador de publicaciones, esto pasa a ser prioritario.
- [ ] **Posible integración directa de publicación** (Meta Graph API, etc.) en vez de solo
      generar el contenido para que un humano lo suba a mano — fuera de alcance del diseño
      original, pero es el paso lógico siguiente si el producto crece.
- [ ] **Reembolso de créditos en caso de error de la IA** — actualmente se descuenta el saldo
      antes de la llamada a Gemini; si la llamada falla, el crédito se pierde sin reembolso.

---

## 7. Prompt para Google Stitch (diseño del frontend del proyecto nuevo)

Pegá esto en Google Stitch para que diseñe las pantallas del nuevo proyecto desde cero
(sin arrastrar el look de Grafiko — dejá que Stitch proponga su propio design system, después
se integra a React con la skill de conversión Stitch → React del otro proyecto). Pedí las
pantallas una por una si Stitch te limita a una por prompt; el bloque de contexto general
(primeras líneas) va siempre incluido.

---

**Contexto del producto** (incluir en cada pantalla que le pidas a Stitch):

> Estoy diseñando una web app B2B llamada [NOMBRE DEL PROYECTO], una herramienta que usan
> agencias/negocios para generar campañas de marketing de 30 días con Inteligencia Artificial
> **en nombre de sus propios clientes**. El usuario final de la app es el dueño o el equipo de
> marketing de la agencia, no el cliente final de esa agencia. Estilo visual: profesional,
> confiable, con un acento de "producto de IA" (usar violeta/índigo como color de acento para
> todo lo relacionado a generación con IA, evitar que se sienta genérico o infantil). Diseño
> tipo SaaS moderno, cards con bordes muy redondeados, mucho aire/espaciado, tipografía
> geométrica y extra bold para títulos. Modo claro y oscuro. Iconografía: Material Symbols
> Outlined.

**Pantalla 1 — Selector de cliente (estado vacío / inicial)**

> Pantalla inicial de la sección "Campañas". Sin ningún cliente seleccionado todavía. Centro
> de la pantalla: ícono grande, título "Campañas de Clientes", subtítulo explicando que hay
> que elegir un cliente para empezar. Un buscador prominente con ícono de lupa, placeholder
> "Buscar cliente por nombre...", que al escribir muestra una lista desplegable de resultados
> debajo (cada resultado con ícono de persona + nombre). Debajo del buscador, un link o botón
> secundario "+ Crear cliente nuevo" por si no existe todavía.

**Pantalla 2 — Workspace del cliente seleccionado (layout general)**

> Una vez elegido un cliente, la pantalla cambia a un layout de dos columnas. Arriba de todo,
> una barra con: a la izquierda un chip/card mostrando el avatar o ícono del cliente + su
> nombre + botón pequeño "Cambiar cliente"; a la derecha una card compacta tipo "wallet"
> mostrando el saldo de créditos de IA disponible (fondo degradado violeta a índigo, ícono de
> destello, monto grande en blanco).
>
> Columna izquierda (más angosta, ~30% del ancho): dos cards apiladas.
> - Card 1 "Identidad Visual": zona de dropzone para subir imágenes (drag & drop), grid de
>   miniaturas de las imágenes ya subidas (con botón eliminar al hacer hover), botón "Analizar
>   Identidad" con el costo en créditos entre paréntesis, y debajo — si ya hay un análisis — una
>   card con fondo violeta muy suave mostrando el párrafo de descripción de estilo generado.
> - Card 2 "Campañas": lista de campañas existentes de ese cliente (cada una con nombre, rango
>   de fechas, badge de estado con colores: verde para activa, ámbar para borrador, gris para
>   archivada), y un botón "+" para crear una campaña nueva.
>
> Columna derecha (más ancha, ~70%): panel principal que cambia según qué esté seleccionado
> (formulario de nueva campaña, o el detalle de una campaña — ver pantallas siguientes). Si no
> hay nada seleccionado, un estado vacío centrado invitando a crear la primera campaña.

**Pantalla 3 — Formulario "Nueva Campaña"**

> Formulario dentro del panel derecho, de una sola columna con secciones bien separadas.
> Campos: Nombre de campaña (input grande), fila de dos columnas con Fecha inicio / Fecha fin
> (date pickers), fila de dos columnas con Objetivo (select: Reconocimiento, Leads, Ventas,
> Interacción, Tráfico) / Meta a lograr (input de texto libre, con un pequeño texto de ayuda
> aclarando "la completás vos, no la IA"), selector de Plataformas como chips seleccionables
> (Instagram, Facebook, TikTok, LinkedIn, Twitter/X, YouTube — cada chip con su ícono), input
> de Público objetivo, y un textarea grande al final para "Contexto adicional / Instrucciones
> libres". Al pie: botón secundario "Cancelar" y botón primario grande "Crear y Generar
> Campaña" con ícono de destello y el costo en créditos, en violeta con sombra.

**Pantalla 4 — Detalle de campaña: plan estratégico generado**

> Header del panel: nombre de la campaña en título grande, badge de estado a la derecha, fila
> de metadatos chicos debajo (objetivo, rango de fechas). Card destacada con fondo violeta muy
> suave y un ícono de IA en la esquina, mostrando el "Resumen Ejecutivo" generado (un párrafo).
> Debajo, un selector de 4 tabs horizontales iguales, uno por semana ("Semana 1" a "Semana 4"),
> con el tab activo resaltado en blanco con sombra sobre un fondo gris. Debajo de los tabs, una
> card mostrando el eje temático y el enfoque de la semana seleccionada, con un botón a la
> derecha "Generar Posts de esta Semana" (con costo en créditos) si esa semana todavía no tiene
> contenido generado.

**Pantalla 5 — Detalle de campaña: lista de posts de una semana**

> Debajo de la card del pilar semanal (pantalla anterior), cuando la semana ya tiene posts
> generados: una lista vertical de cards, una por post. Cada card de post tiene: fila superior
> con badges chicos (día de la semana, plataforma, tipo de contenido) y un badge de estado a la
> derecha (pendiente=ámbar, aprobado=verde, rechazado=rojo); un bloque destacado con el "Hook"
> entre comillas en itálica/bold; el copy completo del post como párrafo; una card pequeña con
> ícono de "toque" mostrando el CTA; una fila de chips grises con los hashtags; si el post
> tiene imagen generada, un preview grande de la imagen con dos botones flotantes "Ver" y
> "Descargar" sobre la esquina; al pie de la card, a la izquierda dos botones "Rechazar"
> (outline rojo) y "Aprobar" (verde sólido), y a la derecha un botón "Generar Imagen" (o
> "Regenerar Imagen" si ya existe) con costo en créditos, en violeta.

**Pantalla 6 — Modal "Cargar saldo de créditos"**

> Modal centrado sobre overlay oscuro difuminado. Header con ícono de tarjeta + título "Cargar
> Saldo" y subtítulo "Créditos de Inteligencia Artificial". Un input numérico grande y
> prominente para el monto (con símbolo de moneda), un input de texto más chico para
> descripción/referencia opcional. Al pie: botón "Cancelar" (outline) y botón "Confirmar Carga"
> (violeta sólido, con ícono).

---

## 8. Resumen de archivos de referencia (proyecto Grafiko original)

Si se migran/copian archivos como punto de partida (ajustando nombres de tabla si se sacan
los sufijos `_cliente`, y quitando el acoplamiento al wallet compartido):

- `supabase/migrations/20260711104725_campanas_clientes.sql` — schema v1 (identidad visual).
- `supabase/migrations/20260711105521_campanas_clientes_v2_plan_semanal.sql` — schema v2
  (campañas + posts, estructura final de 3 niveles).
- `supabase/functions/analizar-identidad-cliente/index.ts`
- `supabase/functions/generar-campana/index.ts`
- `supabase/functions/generar-semana-campana/index.ts`
- `supabase/functions/generar-imagen-campana/index.ts`
- `src/pages/ClientCampaignsPage.tsx` — página única del frontend (1485 líneas).
