# Pruebas de la base de datos

Dos scripts SQL que se pegan en el **SQL Editor de Supabase** (o se ejecutan por el MCP `execute_sql`). Los dos **revierten todo**: terminan con un error controlado, y el resultado está en el texto de ese error. No dejan datos de prueba.

| Script | Para qué | Cuándo | Duración |
|---|---|---|---|
| [`regresion.sql`](regresion.sql) | Verifica que las funciones, triggers, vistas y permisos de **plata y stock** hacen lo correcto (cobros, crédito, caja, stock, compras, costeo, seguridad). ~70 chequeos. | **Antes y después de tocar cualquier función, vista o trigger de plata/stock.** | ~2 s |
| [`carga.sql`](carga.sql) | Genera 20.000 trabajos / 60.000 ítems / 12.000 pagos y mide las consultas clave contra un **presupuesto de milisegundos**. | Después de cambiar vistas, índices o triggers; y cada tanto cuando crezcan los datos reales. | ~30 s |

## Cómo leer el resultado

- **Regresión**: `REGRESION: 69 de 69 OK, 0 FALLA(S)` → todo bien. Si no, el detalle lista cada `FALLA` con el valor obtenido y el esperado. Los `Avisos` no son fallas (algo omitido o una regla que la base todavía no exige).
- **Carga**: `CARGA: 0 medicion(es) LENTA(S)` → todo dentro de presupuesto. Cada `LENTO` indica qué se pasó del presupuesto y una pista de la causa probable (por ejemplo, un índice faltante).

## Reglas

1. **Ninguna migración que toque plata o stock se aplica sin pasar `regresion.sql` antes y después.**
2. **Al corregir una función, buscar y probar sus "gemelas"**: los errores de plata del 2026-09-25 eran el mismo filtro faltante en tres funciones distintas.
3. **Cada error nuevo que aparezca en uso real se agrega a `regresion.sql` como un chequeo** antes de arreglarlo: así no vuelve.
4. Al medir rendimiento usar columnas reales (`sum(...)`); `count(*)` sobre vistas con `LEFT JOIN` agrupados se simplifica y da tiempos irreales.

## Qué no cubren

- El **frontend** (las pantallas): esto prueba solo la base. Falta la prueba visual con sesión iniciada.
- Las **Edge Functions** de IA (Gemini) y la **integración ARCA/AFIP** (backend externo).
- El registro y login reales de Supabase Auth (solo el trigger que da de alta al usuario en `t_usuarios`).
