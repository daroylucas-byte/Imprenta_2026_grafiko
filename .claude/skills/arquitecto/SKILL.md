---
name: arquitecto
description: >
  Cargar SIEMPRE como primera y única skill al iniciar cualquier sesión.
  Es el punto de entrada que detecta el contexto, pregunta antes de actuar,
  y carga otras skills SOLO cuando son necesarias. Diseñada para minimizar
  uso de tokens. Funciona tanto en proyectos nuevos como existentes.
---

# Arquitecto

## Principios de operación

1. **Preguntar antes de asumir** — nunca cargar una skill sin confirmar con el usuario
2. **Carga diferida** — leer otras skills solo cuando la tarea las requiere, no al inicio
3. **Una skill a la vez** — no cargar múltiples skills en paralelo salvo que la tarea lo exija
4. **Mínimo contexto suficiente** — leer solo las secciones relevantes de cada skill

---

## Inicio de sesión — siempre hacer esto primero

Al arrancar, hacer UNA sola pregunta:

> "¿En qué estamos trabajando hoy?"
> - [ ] Feature nueva o modificación de código
> - [ ] Base de datos o RLS
> - [ ] Integrar diseño de Stitch
> - [ ] Deploy o configuración de Vercel
> - [ ] Auditoría de seguridad
> - [ ] Configurar el proyecto (nuevo o existente)

Con la respuesta, seguir el flujo correspondiente abajo.
No leer ninguna skill todavía.

---

## Flujos por tarea

### Feature nueva / modificación de código
1. Preguntar: ¿toca BD o solo frontend?
   - Solo frontend → trabajar directo, sin cargar skills adicionales
   - Toca BD → preguntar: ¿es proyecto de comercio o municipal?
     - Comercio → "¿Querés que use la skill de Supabase multi-tenant?" → si sí, cargarla
     - Municipal → usar patrones del CLAUDE.md del proyecto

### Base de datos / RLS
1. Preguntar: ¿es schema nuevo, modificación o debugging de políticas?
2. Ofrecer: "Tengo una skill específica para esto, ¿la uso?"
3. Si sí → cargar `supabase-comercio-multitenant` o el patrón municipal según corresponda
4. Recordar al final: "¿Querés que genere los tests de RLS para estos cambios?"

### Integrar diseño de Stitch
1. Confirmar: ¿llegó el YAML de design system, el HTML, o ambos?
2. Ofrecer: "Tengo una skill para convertir código de Stitch a React, ¿la uso?"
3. Si sí → cargar `stitch-integration`

### Deploy / Vercel
1. Preguntar: ¿es primer deploy, problema en producción, o agregar variables?
2. Ofrecer: "Tengo una skill de Vercel para PWA con Supabase, ¿la uso?"
3. Si sí → cargar `vercel-deploy`
4. Antes de cualquier push a main → ofrecer: "¿Querés que haga una auditoría de seguridad primero?"

### Auditoría de seguridad
1. Ofrecer: "La auditoría cubre 5 capas: keys expuestas, .gitignore, git history, RLS y MCP. ¿Arranco?"
2. Si sí → cargar `security-audit`

### Configurar el proyecto
1. Preguntar: ¿es proyecto nuevo o existente?

   **Proyecto nuevo:**
   - Preguntar tipo: ¿municipal, comercio/pymes, o mixto?
   - Preguntar: ¿tenés repo en GitHub y proyecto en Vercel/Supabase ya creados?
   - Proponer orden: CLAUDE.md → .mcp.json → .claudeignore → BD → Sentry → tests → CI
   - Confirmar antes de cada paso

   **Proyecto existente:**
   - Preguntar qué querés mejorar: ¿seguridad, BD, monitoreo, tests, deploy?
   - Proponer solo lo relevante, no todo el kit
   - Confirmar antes de modificar cualquier archivo existente

---

## Skills disponibles — solo mencionar cuando son relevantes

| Skill | Cuándo ofrecer |
|-------|---------------|
| `security-audit` | Antes de push a main, al detectar credenciales, al pedir auditoría |
| `stitch-integration` | Al recibir código de Google Stitch |
| `supabase-comercio-multitenant` | Al diseñar BD para comercios/pymes con múltiples locales |
| `vercel-deploy` | Al configurar deploy, PWA no se actualiza, agregar env vars |

---

## Reglas que nunca se omiten (sin necesidad de cargar otra skill)

- Nunca escribir keys o tokens en archivos de código
- Nunca deshabilitar RLS
- Nunca `service_role` key en el cliente — solo en tests/Edge Functions
- Variables con prefijo `VITE_` van al bundle del cliente — nunca poner secrets ahí
- Toda llamada a Supabase va por `services/` — nunca directo desde componentes
- Antes de modificar un archivo existente → mostrar el cambio propuesto y pedir confirmación

## Señales de alerta — detener y consultar siempre

- JWT (`eyJ...`) hardcodeado en cualquier archivo de código
- Pedido de deshabilitar RLS o usar `SECURITY DEFINER` sin justificación clara
- Cambios directos en BD de producción
- Variable `VITE_*` que parece un secret
- Push a main sin tests pasando

---

## Generar CLAUDE.md — cuando no existe en el proyecto

Si al arrancar una sesión no existe `CLAUDE.md` en la raíz, ofrecerlo:

> "No encontré un CLAUDE.md en este proyecto. ¿Querés que lo genere?
> Me lleva 2 minutos y después no tenés que explicar el contexto en cada sesión."

Si acepta, hacer estas preguntas en UNA sola tanda:

1. ¿Nombre del proyecto y para quién es? (cliente/institución)
2. ¿Supabase project-ref? (Settings → General → Reference ID)
3. ¿Qué tipo de proyecto? (municipal / comercio / mixto / otro)
4. ¿Cuáles son las páginas o módulos principales?
5. ¿Qué roles de usuario existen?

Con esas respuestas + lo que Claude Code puede leer del proyecto
(package.json, vite.config, estructura de src/, .env.example),
generar el CLAUDE.md completo y mostrarlo para aprobación antes de crearlo.

**Estructura mínima del CLAUDE.md generado:**
- Identidad (nombre, cliente, tipo, project-ref, estado)
- Stack técnico (versiones reales del package.json)
- Estructura de carpetas (leída del proyecto real)
- Base de datos (tablas y roles que el usuario confirmó)
- Convenciones de código (inferidas del código existente)
- Variables de entorno (leídas del .env.example si existe)
- Pendientes conocidos (vacío al inicio, se completa con el tiempo)
- Lo que NO hacer (reglas fijas de seguridad)
