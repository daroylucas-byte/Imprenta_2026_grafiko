---
name: security-audit
description: >
  Usar cuando el usuario pida revisar seguridad del proyecto: keys/tokens
  expuestos, variables de entorno en git, políticas RLS de Supabase,
  .gitignore/.claudeignore, configuración del .mcp.json, o antes de
  cualquier push/deploy a producción. También activar si se detectan
  credenciales hardcodeadas en cualquier archivo del proyecto.
---

# Skill: Auditoría de Seguridad — PWA Municipal + Supabase

## Las 5 capas a auditar (siempre en este orden)

---

## CAPA 1 — Secretos expuestos en archivos del proyecto

### Qué buscar

Escanear TODO el proyecto con:
```bash
# Buscar patrones de keys/tokens hardcodeados
grep -rn "eyJ" --include="*.ts" --include="*.tsx" --include="*.js" \
     --include="*.json" --include="*.env" --include="*.md" .

grep -rn "SUPABASE_SERVICE_ROLE\|service_role\|anon_key\|ANON_KEY" \
     --include="*.ts" --include="*.tsx" --include="*.js" \
     --include="*.json" --include="*.md" --include="CLAUDE.md" .

grep -rn "sk-\|Bearer \|token.*=\|key.*=\|secret.*=" \
     --include="*.ts" --include="*.tsx" --include="*.js" .
```

### Archivos de alto riesgo a revisar manualmente
- `CLAUDE.md` — NUNCA debe contener keys ni tokens
- `.mcp.json` — las keys deben ser `${ENV_VAR}`, nunca literales
- `.claude/settings.json` — mismo criterio
- `src/lib/supabase.ts` — solo debe usar `import.meta.env.*`
- Cualquier `*.config.ts` o `*.config.js`

### Resultado esperado (correcto)
```typescript
// ✅ CORRECTO — usa variables de entorno
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// ❌ MAL — key hardcodeada
const supabase = createClient(
  'https://abcdef.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
)
```

---

## CAPA 2 — Archivos .gitignore y .claudeignore

### Verificar que .gitignore contenga MÍNIMAMENTE

```gitignore
# Variables de entorno
.env
.env.local
.env.*.local
.env.development
.env.production

# Claude Code — configuración personal
.claude/settings.local.json
CLAUDE.local.md

# Supabase local
supabase/.branches
supabase/.temp

# Dependencias
node_modules/

# Build
dist/
build/
.next/

# Certificados y keys
*.pem
*.key
*.p12
*.pfx
secrets/
credentials/
```

### Verificar que .claudeignore exista y contenga

```
# .claudeignore — archivos que Claude Code NO debe leer
.env
.env.*
*.pem
*.key
secrets/
credentials/
node_modules/
dist/
```

### Comando de verificación
```bash
# Ver qué archivos rastrearían un git add accidental
git status --short
git ls-files --others --exclude-standard | grep -E "\.env|\.key|\.pem|secret"
```

---

## CAPA 3 — Git history (el más peligroso)

Si alguna vez se commiteó un secreto, borrarlo del working tree NO es suficiente.
Queda en el historial para siempre.

### Detectar si hay secretos en el historial
```bash
# Buscar en TODO el historial git
git log --all --full-history -- "*.env" "*.env.local"
git log -S "eyJ" --oneline  # busca JWTs en commits
git log -S "service_role" --oneline
git log -S "SUPABASE" --oneline
```

### Si se encuentra algo → protocolo de emergencia
1. **Rotar inmediatamente** las keys expuestas (Supabase dashboard → API Keys → Regenerate)
2. **NO usar `git revert`** — el secreto sigue en historial
3. Usar `git filter-repo` para reescribir el historial:
   ```bash
   pip install git-filter-repo
   git filter-repo --path .env --invert-paths
   ```
4. Force push a todas las ramas: `git push origin --force --all`
5. Notificar a colaboradores para que rehagan sus clones

### Prevención — pre-commit hook
Crear `.git/hooks/pre-commit`:
```bash
#!/bin/sh
# Bloquear commits con posibles secretos
if git diff --cached --name-only | xargs grep -l "eyJ\|service_role\|ANON_KEY" 2>/dev/null; then
  echo "❌ BLOQUEADO: posibles secretos detectados en el commit"
  echo "Revisá los archivos marcados arriba"
  exit 1
fi
```
```bash
chmod +x .git/hooks/pre-commit
```

---

## CAPA 4 — Row Level Security (RLS) en Supabase

### Verificar estado de RLS en todas las tablas

```sql
-- Tablas SIN RLS activado (riesgo crítico)
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
```

Si el resultado tiene filas → esas tablas son accesibles por CUALQUIER usuario
autenticado (o anónimo si la policy lo permite).

### Verificar políticas existentes

```sql
-- Ver todas las políticas RLS del proyecto
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Patrones problemáticos a detectar

```sql
-- ❌ MAL: policy que permite todo a cualquiera
CREATE POLICY "allow_all" ON tramites FOR ALL USING (true);

-- ❌ MAL: tabla con RLS activado pero SIN políticas
-- (bloquea TODO — ni el propio usuario puede leer sus datos)
ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
-- sin ningún CREATE POLICY → nadie puede acceder

-- ✅ CORRECTO: política por usuario autenticado
CREATE POLICY "own_data" ON tramites
  FOR ALL USING (auth.uid() = user_id);

-- ✅ CORRECTO: lectura pública, escritura solo autenticado
CREATE POLICY "public_read" ON noticias
  FOR SELECT USING (true);
CREATE POLICY "auth_write" ON noticias
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
```

### Verificar uso de service_role vs anon key

```sql
-- Ver si hay funciones con SECURITY DEFINER (bypasean RLS)
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND security_type = 'DEFINER';
```

⚠️ Las funciones `SECURITY DEFINER` corren con permisos del owner y
**bypasean RLS**. Usar solo cuando sea estrictamente necesario.
Preferir `SECURITY INVOKER` por defecto.

---

## CAPA 5 — Configuración de MCP y Claude Code

### .mcp.json — verificar que no tenga keys literales

```json
// ✅ CORRECTO — referencia a variable de entorno del sistema
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_SERVICE_ROLE_KEY": "${SUPABASE_SERVICE_ROLE_KEY}"
      }
    }
  }
}

// ❌ MAL — key literal en el archivo
{
  "mcpServers": {
    "supabase": {
      "env": {
        "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
      }
    }
  }
}
```

### .claude/settings.json — verificar permisos

```json
// ✅ CORRECTO — bloquea lectura de .env
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(.env.local)"
    ]
  }
}
```

---

## Checklist de reporte (output de la auditoría)

Al terminar el análisis, generar un reporte con este formato:

```markdown
## 🔐 Reporte de Seguridad — [nombre-proyecto] — [fecha]

### CAPA 1: Secretos en archivos
- [ ] ✅/❌ Sin keys hardcodeadas en src/
- [ ] ✅/❌ CLAUDE.md sin credenciales
- [ ] ✅/❌ .mcp.json usa variables de entorno

### CAPA 2: Archivos ignorados
- [ ] ✅/❌ .gitignore cubre .env y variantes
- [ ] ✅/❌ .claudeignore existe y es correcto

### CAPA 3: Git history
- [ ] ✅/❌ Sin secretos detectados en historial
- [ ] ✅/❌ pre-commit hook instalado

### CAPA 4: RLS Supabase
- [ ] ✅/❌ Todas las tablas tienen RLS activado
- [ ] ✅/❌ Políticas cubren todos los roles
- [ ] ✅/❌ Sin SECURITY DEFINER innecesarios

### CAPA 5: Claude Code / MCP
- [ ] ✅/❌ .mcp.json sin keys literales
- [ ] ✅/❌ settings.json bloquea .env

### Hallazgos críticos (acción inmediata)
[lista de problemas que requieren rotación de keys]

### Hallazgos medios (corregir antes del próximo deploy)
[lista de problemas de configuración]

### Recomendaciones
[mejoras opcionales]
```

---

## Herramientas externas recomendadas (instalar una vez)

```bash
# Trufflehog — detecta secretos en git history
brew install trufflehog
trufflehog git file://. --only-verified

# git-secrets — prevención pre-commit
brew install git-secrets
git secrets --install
git secrets --register-aws  # patrones AWS
# agregar patrones Supabase:
git secrets --add 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

# detect-secrets (Python)
pip install detect-secrets
detect-secrets scan > .secrets.baseline
```

---

## Notas específicas para proyectos municipales

Los proyectos municipales tienen consideraciones extra:

1. **Datos sensibles de ciudadanos** (DNI, domicilio, situación social):
   las políticas RLS deben ser más restrictivas que proyectos comerciales.
   Nunca exponer datos de terceros a través de la anon key.

2. **Roles municipales** (`vecino`, `inspector`, `admin_area`, `admin_municipio`):
   cada tabla debe tener políticas para CADA rol explícitamente.
   No asumir que "si no hay policy de ese rol, no puede acceder" — verificarlo.

3. **Auditoría de accesos**: considerar agregar triggers de Supabase que
   logueen accesos a tablas sensibles (NNyA, datos médicos, etc.):
   ```sql
   CREATE TABLE audit_log (
     id uuid DEFAULT gen_random_uuid(),
     user_id uuid REFERENCES auth.users,
     tabla text,
     operacion text,
     created_at timestamptz DEFAULT now()
   );
   ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
   -- Solo admins pueden leer
   CREATE POLICY "admin_only" ON audit_log
     FOR SELECT USING (
       EXISTS (
         SELECT 1 FROM usuarios
         WHERE id = auth.uid() AND rol = 'admin_municipio'
       )
     );
   ```
