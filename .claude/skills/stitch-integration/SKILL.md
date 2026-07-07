---
name: stitch-integration
description: >
  Usar cuando el usuario pase código generado por Google Stitch para integrarlo
  al proyecto PWA/Supabase. Stitch genera dos artefactos: (1) un archivo YAML
  con el design system y (2) HTML con Tailwind config inline por página.
  Esta skill transforma ese output en componentes React reutilizables con
  conexión a Supabase, siguiendo las convenciones del proyecto.
---

# Skill: Integración de Google Stitch → React + Supabase

## Qué genera Stitch (input esperado)

Stitch produce SIEMPRE dos artefactos:

### 1. Archivo de diseño (YAML)
Contiene el design system completo:
- `colors`: paleta Material Design 3 con nombres semánticos
- `typography`: escalas tipográficas con fontFamily, fontSize, fontWeight, lineHeight
- `rounded`: border-radius tokens
- `spacing`: escala de espaciado en px
- Una sección narrativa describiendo Brand, Colors, Typography, Layout, Elevation, Shapes, Components

### 2. HTML por página
Contiene:
- `<script id="tailwind-config">` con el objeto `tailwind.config` completo
  (colores, borderRadius, spacing, fontFamily, fontSize como extensiones)
- HTML con clases Tailwind usando los tokens del design system
- Íconos: **Material Symbols Outlined** (NO Lucide) cargados via Google Fonts CDN
- Scripts inline de comportamiento (toggles, submit handlers, etc.)

---

## Proceso de transformación (siempre seguir este orden)

### PASO 1 — Extraer tokens del YAML de diseño

Crear `src/styles/tokens.ts` con los tokens tipados:

```typescript
// src/styles/tokens.ts
// Generado desde el YAML de diseño de Stitch
export const colors = {
  primary: '#00685f',
  onPrimary: '#ffffff',
  primaryContainer: '#008378',
  // ... todos los colores del YAML
} as const

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  // ... todos los spacings
} as const
```

### PASO 2 — Configurar Tailwind

Extraer el objeto `tailwind.config` del `<script id="tailwind-config">` del HTML
y volcarlo en `tailwind.config.ts` del proyecto:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { /* copiar exactamente del tailwind.config de Stitch */ },
      borderRadius: { /* copiar exactamente */ },
      spacing: { /* copiar exactamente */ },
      fontFamily: { /* copiar exactamente */ },
      fontSize: { /* copiar exactamente */ },
    },
  },
  plugins: [],
} satisfies Config
```

⚠️ IMPORTANTE: Los nombres de colores en Stitch usan kebab-case
(`surface-container-low`). En React con Tailwind se usan igual:
`bg-surface-container-low`. NO convertir a camelCase.

### PASO 3 — Reemplazar íconos

Stitch usa **Material Symbols Outlined** via CDN. En React, reemplazar por
**Lucide React** (ya instalado en el proyecto). Tabla de equivalencias comunes:

| Material Symbol    | Lucide React        |
|--------------------|---------------------|
| `person`           | `<User />`          |
| `mail`             | `<Mail />`          |
| `lock`             | `<Lock />`          |
| `visibility`       | `<Eye />`           |
| `visibility_off`   | `<EyeOff />`        |
| `account_balance`  | `<Building2 />`     |
| `expand_more`      | `<ChevronDown />`   |
| `arrow_forward`    | `<ArrowRight />`    |
| `sync`             | `<RefreshCw />`     |
| `search`           | `<Search />`        |
| `add`              | `<Plus />`          |
| `delete`           | `<Trash2 />`        |
| `edit`             | `<Pencil />`        |
| `close`            | `<X />`             |
| `check`            | `<Check />`         |
| `warning`          | `<AlertTriangle />` |
| `info`             | `<Info />`          |

Todos los íconos de Lucide usan `strokeWidth={2}` por defecto (coincide con
el estilo de Stitch). Tamaño: usar `size={20}` o la clase `w-5 h-5`.

### PASO 4 — Convertir HTML a componente React

Reglas de conversión:

1. **Estructura**: extraer el `<main>` como componente, header/footer como
   layouts separados si se repiten entre páginas.

2. **Atributos HTML → JSX**:
   - `class` → `className`
   - `for` → `htmlFor`
   - `type="submit"` en `<button>` → mantener
   - Eliminar `action="#"` de `<form>`

3. **NO usar `<form>` HTML**: reemplazar por `<div>` con handler en el botón
   de submit (restricción del entorno React del proyecto).

4. **Estado con useState**:
   ```typescript
   // Ejemplo: toggle de password del ejemplo de Stitch
   const [showPassword, setShowPassword] = useState(false)
   ```

5. **Scripts inline → handlers tipados**:
   ```typescript
   // Script inline de Stitch:
   // function togglePassword() { ... }
   
   // En React:
   const handleTogglePassword = () => {
     setShowPassword(prev => !prev)
   }
   ```

6. **Select con opciones estáticas**: mantener como JSX. Si las opciones
   vienen de Supabase, conectar via hook (ver PASO 5).

### PASO 5 — Conectar datos con Supabase

Identificar qué elementos del componente necesitan datos dinámicos:

**Selects / dropdowns con datos de BD**:
```typescript
// src/hooks/useMunicipios.ts
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useMunicipios() {
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('municipios')
      .select('id, nombre')
      .order('nombre')
      .then(({ data }) => {
        if (data) setMunicipios(data)
        setLoading(false)
      })
  }, [])

  return { municipios, loading }
}
```

**Formularios de registro/creación**:
```typescript
// Usar services/, nunca llamar supabase directo desde el componente
import { registrarUsuario } from '../services/usuariosService'

const handleSubmit = async () => {
  setLoading(true)
  const { error } = await registrarUsuario({ nombre, email, municipioId, password })
  if (error) setError(error.message)
  setLoading(false)
}
```

### PASO 6 — Estructura de archivos resultante

Por cada página/pantalla de Stitch, crear:

```
src/
├── pages/
│   └── [NombrePagina]/
│       └── index.tsx           ← componente principal
├── components/
│   └── [feature]/
│       ├── [Componente].tsx    ← sub-componentes extraídos
│       └── index.ts            ← barrel export
├── hooks/
│   └── use[Entidad].ts        ← si hay datos de Supabase
└── services/
    └── [entidad]Service.ts     ← operaciones Supabase
```

---

## Checklist de validación antes de entregar

- [ ] Todos los tokens de color están en `tailwind.config.ts`
- [ ] No quedan referencias a Material Symbols (reemplazados por Lucide)
- [ ] No quedan `<form>` HTML (convertidos a `<div>` con handlers)
- [ ] No quedan `class=` (convertidos a `className=`)
- [ ] No quedan `for=` en labels (convertidos a `htmlFor=`)
- [ ] Datos dinámicos van por `services/`, no directo desde el componente
- [ ] Hay tipos TypeScript para todas las props y estados
- [ ] El componente funciona sin props requeridas (o tiene defaults)

---

## Ejemplo de output esperado

**Input (fragmento de Stitch)**:
```html
<div class="space-y-2">
  <label class="block font-label-md text-label-md text-on-surface" for="email">
    Correo Electrónico
  </label>
  <div class="relative">
    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 
                 text-on-surface-variant text-[20px]">mail</span>
    <input class="w-full h-12 pl-10 pr-4 bg-surface-container-low 
                  border border-outline-variant rounded-lg font-body-md 
                  text-body-md form-input-focus transition-all"
           id="email" type="email" placeholder="juan@municipio.gob" required />
  </div>
</div>
```

**Output (React)**:
```tsx
import { Mail } from 'lucide-react'

// Dentro del componente:
<div className="space-y-2">
  <label htmlFor="email" className="block font-label-md text-label-md text-on-surface">
    Correo Electrónico
  </label>
  <div className="relative">
    <Mail
      size={20}
      className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
    />
    <input
      id="email"
      type="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      placeholder="juan@municipio.gob"
      className="w-full h-12 pl-10 pr-4 bg-surface-container-low
                 border border-outline-variant rounded-lg font-body-md
                 text-body-md focus:outline-none focus:border-primary
                 focus:ring-2 focus:ring-primary/10 transition-all"
    />
  </div>
</div>
```

---

## Notas importantes

- **form-input-focus**: Esta clase CSS custom de Stitch no existe en Tailwind.
  Reemplazar siempre por clases Tailwind estándar:
  `focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10`

- **animate-spin**: Esta sí existe en Tailwind, mantenerla para loaders.

- **dark mode**: Stitch genera clases `dark:*`. El proyecto usa `darkMode: 'class'`
  en Tailwind, por lo que funcionan automáticamente.

- **Imágenes/logos**: Los `src="data:image/png;base64,..."` de Stitch reemplazarlos
  por assets reales en `public/` o `src/assets/`.

- **Clases `appearance-none`**: Mantenerlas en selects para consistencia cross-browser.
