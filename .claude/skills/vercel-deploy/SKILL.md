---
name: vercel-deploy
description: >
  Usar cuando se va a configurar o hacer deploy a Vercel de un proyecto
  PWA con Vite + React + Supabase. Cubre: vercel.json, variables de
  entorno por ambiente (production/preview/development), headers para
  PWA y Service Worker, integración con Supabase branching, Sentry
  auth token en CI, y checklist pre-deploy. También activar cuando
  hay problemas con el Service Worker después de un deploy, o cuando
  el cliente reporta que "la app no se actualiza".
---

# Skill: Deploy a Vercel — Vite PWA + Supabase

## Archivos a crear en cada proyecto

### 1. vercel.json — configuración base

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm ci",

  "headers": [
    {
      "source": "/(.*).html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        },
        {
          "key": "Service-Worker-Allowed",
          "value": "/"
        }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/manifest+json"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ],

  "rewrites": [
    {
      "source": "/((?!api/.*).*)",
      "destination": "/index.html"
    }
  ]
}
```

⚠️ Los headers son críticos para PWA:
- `sw.js` y `*.html` NO deben cachearse — si el browser cachea el SW,
  los usuarios nunca reciben actualizaciones de la app.
- `/assets/` SÍ debe cachearse agresivamente — Vite les pone hash
  en el nombre, así que un cambio = nuevo archivo = nuevo URL.
- El `Content-Type` del manifest es obligatorio en algunos browsers
  para que funcione la instalación como PWA.

---

### 2. Variables de entorno en Vercel

Configurar en Vercel Dashboard → Settings → Environment Variables.
Tres ambientes: **Production**, **Preview**, **Development**.

#### Producción (rama `main`)

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase de producción |
| `VITE_SUPABASE_ANON_KEY` | Anon key de producción |
| `VITE_SENTRY_DSN` | DSN de Sentry |
| `VITE_SENTRY_ORG` | Org slug de Sentry |
| `VITE_SENTRY_PROJECT` | Project slug de Sentry |
| `VITE_APP_VERSION` | Versión (ej: `1.2.0`) |
| `SENTRY_AUTH_TOKEN` | Auth token para subir source maps ⚠️ sin prefijo VITE_ |

#### Preview (todas las ramas excepto main)

| Variable | Descripción |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase de **staging/dev** |
| `VITE_SUPABASE_ANON_KEY` | Anon key de **staging/dev** |
| `VITE_SENTRY_DSN` | Mismo DSN (Sentry diferencia por environment) |

⚠️ NUNCA conectar Preview al proyecto Supabase de producción.
Crear un proyecto Supabase separado para staging/dev.

#### Via CLI (para automatizar)

```bash
vercel link                                    # linkar proyecto

# Producción
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add SENTRY_AUTH_TOKEN production    # sin VITE_

# Preview (staging)
vercel env add VITE_SUPABASE_URL preview
vercel env add VITE_SUPABASE_ANON_KEY preview

# Ver todas las vars
vercel env ls
```

---

### 3. Integración Supabase ↔ Vercel (opcional pero recomendado)

Cuando está activa, Supabase actualiza automáticamente las env vars
de Vercel al abrir un PR, apuntando al branch de Supabase correspondiente.

```
Supabase Dashboard → Project → Integrations → Vercel → Connect
```

La sincronización ocurre cuando se abre el PR, no cuando se crea el branch. Puede haber una race condition entre que Supabase setea las variables y Vercel dispara el build — si el preview falla con error de conexión a Supabase, re-deployar manualmente.

---

### 4. GitHub Actions — CI con tests antes del deploy

```yaml
# .github/workflows/deploy.yml
name: CI + Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Supabase local start
        run: supabase start

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Tests de RLS
        run: npm run test:rls
        env:
          TEST_SUPABASE_URL: http://127.0.0.1:54321
          TEST_SUPABASE_ANON_KEY: ${{ secrets.TEST_ANON_KEY }}
          TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SERVICE_KEY }}

      - name: Tests pgTAP
        run: supabase test db

  # Vercel hace el deploy automáticamente vía su integración con GitHub
  # Este job solo bloquea el merge si los tests fallan
```

---

## Checklist pre-deploy (correr antes de cada push a main)

```bash
# 1. Tests de RLS pasan
npm run test:rls

# 2. Build sin errores
npm run build

# 3. Preview local del build (verificar que la PWA funciona)
npm run preview
# Abrir http://localhost:4173 y verificar:
# - La app carga correctamente
# - DevTools → Application → Service Workers → muestra "activated"
# - DevTools → Application → Manifest → sin errores

# 4. Verificar source maps de Sentry
# En la salida del build debe aparecer:
# ✓ Sentry: source maps uploaded
# ✓ Sentry: release created

# 5. Migraciones de Supabase
supabase db diff          # ver cambios pendientes
supabase db push          # aplicar a producción (hacerlo DESPUÉS del deploy)
```

---

## Problemas comunes y soluciones

### "La app no se actualiza" después de un deploy

El Service Worker sigue sirviendo la versión vieja desde caché.

Causas y soluciones:
1. `sw.js` está siendo cacheado — verificar que el header
   `Cache-Control: max-age=0, must-revalidate` esté en el `vercel.json`.
2. El usuario necesita cerrar TODAS las pestañas de la app y reabrir.
3. Agregar un prompt de actualización al Service Worker:

```typescript
// src/main.tsx — mostrar un aviso cuando hay nueva versión
import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    // Mostrar un toast/banner al usuario
    if (confirm('Nueva versión disponible. ¿Actualizar ahora?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App lista para usar offline')
  },
})
```

### "Mixed content" o "HTTPS required" en producción

El Service Worker solo funciona en HTTPS. Vercel lo maneja automáticamente,
pero si usás un dominio custom verificar que el certificado SSL esté activo.

### Preview deployment conecta a Supabase de producción

Las variables de entorno de Preview están seteadas incorrectamente.
Verificar en Vercel Dashboard → Settings → Environment Variables →
filtrar por "Preview" y confirmar que apuntan al proyecto de staging.

### Error al subir source maps de Sentry

```
Error: Authentication credentials were not provided
```

Verificar que `SENTRY_AUTH_TOKEN` (sin prefijo `VITE_`) esté seteada
en las variables de **producción** de Vercel. El prefijo `VITE_` incrusta
la variable en el bundle del cliente — el auth token nunca debe ir ahí.

### PWA no es instalable en producción

Checklist:
- [ ] `manifest.webmanifest` tiene `Content-Type: application/manifest+json`
- [ ] El manifest tiene `icons` con tamaños 192x192 y 512x512
- [ ] La app se sirve por HTTPS
- [ ] El `start_url` del manifest coincide con la URL raíz del deploy
- [ ] `display: "standalone"` en el manifest

---

## Estructura de archivos del deploy

```
tu-proyecto/
├── vercel.json              ← headers, rewrites, build config
├── .github/
│   └── workflows/
│       └── deploy.yml       ← CI: tests → Vercel hace el deploy
└── public/
    └── icons/
        ├── icon-192.png     ← requerido para PWA instalable
        └── icon-512.png     ← requerido para PWA instalable
```

## Flujo completo de un deploy

```
git push origin main
    │
    ├── GitHub Actions dispara
    │   ├── supabase start (local)
    │   ├── npm run test:rls  ✓ o ✗
    │   └── supabase test db  ✓ o ✗
    │
    └── Vercel dispara (en paralelo)
        ├── npm ci
        ├── npm run build
        │   ├── Vite compila
        │   ├── vite-plugin-pwa genera sw.js + manifest
        │   └── sentryVitePlugin sube source maps
        └── Deploy a producción
            └── Headers del vercel.json aplicados al dist/
```

Si los tests de GitHub Actions fallan → el PR no se puede mergear.
Si el build de Vercel falla → el deploy no se hace.
Si ambos pasan → deploy automático sin intervención manual.
