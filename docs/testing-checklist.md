# Checklist de prueba visual — todo lo hecho en esta sesión

Todo lo de abajo se probó por SQL, build y pruebas automáticas contra la base (ninguna quedó sin verificar de esa forma), pero **nunca se vio en pantalla con sesión real**. Anotá al lado de cada ítem si funcionó o no; si algo falla, decime el paso exacto y el error (captura o texto de consola).

Sugerencia de orden: de arriba hacia abajo, porque varios pasos dependen de datos creados en el paso anterior (por ejemplo, necesitás un insumo cargado antes de poder comprarlo).

---

## 1. Configuración → Presupuestos

- [ ] `/configuracion` → categoría "Presupuestos" → **Condiciones del Presupuesto**: crear una condición nueva (ej. "Incluye envío").
- [ ] Crear un trabajo nuevo (PRESUPUESTADO): la condición nueva aparece como checkbox tildable.
- [ ] Tildarla y guardar → imprimir el PDF: la condición aparece listada.
- [ ] Editar el trabajo: la condición sigue tildada.

## 2. Trabajos (Ventas / Kanban)

- [ ] `/comercial`, vista **Tabla**: la columna "Specs" muestra círculos con las especificaciones; pasar el mouse muestra el detalle completo.
- [ ] **Buscador**: escribir el nombre de un cliente, parte de una descripción, o una fecha en formato `DD/MM/AAAA` — debe encontrar el trabajo.
- [ ] **Filtro de fechas**: elegir un rango sobre la fecha de ingreso, ver que filtre bien.
- [ ] **Paginado**: cambiar "Por página" (10/25/50/100) y navegar entre páginas.
- [ ] **Duplicar trabajo**: ícono de copiar en un trabajo existente → se crea un presupuesto nuevo con los mismos ítems y specs, sin pagos ni fecha de aprobación, y se abre para editar.
- [ ] **Calculadora de costos**: en un ítem del formulario, tocar "Calcular precio" → agregar un insumo (que ya tenga stock cargado, ver sección 5), un servicio (ver sección 8) y un ítem "Otro" → ver que el precio sugerido tenga sentido → aplicar.
- [ ] El ítem queda con la etiqueta "Costeo interno"; debajo de la tabla de ítems aparece el resumen de costo/ganancia (solo visible ahí, en pantalla).
- [ ] Imprimir el presupuesto: **el desglose de costos no debe aparecer en ningún lado del PDF**.
- [ ] Pasar un trabajo a TERMINADO/ENTREGADO con saldo pendiente: pide el cobro obligatorio antes de dejar avanzar.

## 3. Clientes

- [ ] `/clientes`: buscar por CUIT sin guiones (ej. escribir solo números) y por teléfono — debe encontrar al cliente.
- [ ] Buscar por localidad o rubro.
- [ ] Crear un cliente desde el buscador de un trabajo nuevo (botón "Crear cliente…" al fondo del desplegable de cliente en `JobModal`) — queda seleccionado sin recargar la pantalla.

## 4. Dashboard

- [ ] `/` (Dashboard): tarjeta "Mejores Clientes" con el selector Este mes / Este año / Todo.
- [ ] Un cliente con deuda muestra el badge rojo "Debe" con el monto al pasar el mouse.

## 5. Caja

- [ ] `/caja`, pestaña "Turno Actual": el panel "Recaudación por medio de pago" se actualiza con cada cobro.
- [ ] Cobrar un trabajo en **efectivo**: sube el "Efectivo esperado". Cobrar por **transferencia**: no sube el efectivo, pero sí aparece en el desglose.
- [ ] Botón **"Registrar Gasto"**: pide elegir un tipo de gasto del catálogo (obligatorio).
- [ ] Botón **"Ingreso Extraordinario"**: registra un ingreso que no depende de una venta.
- [ ] **Cerrar turno**: el arqueo pide solo el efectivo contado (no todos los medios juntos). Probar con y sin retiro.
- [ ] Pestaña **"Historial de Cierres"**: aparece el turno recién cerrado, con la columna "Inicia caja siguiente". Tocar la fila abre el detalle con el desglose por medio y, si hubo, el retiro.
- [ ] Dentro del detalle, tocar "Ver todos los movimientos del turno" carga la lista (antes no se veía hasta abrirlo).

## 6. Proveedores (`/proveedores`)

- [ ] Crear un proveedor nuevo, con condición de pago "Cuenta corriente".
- [ ] Abrir su cuenta corriente → "Ajustar Saldo" → cargar una deuda inicial (tipo "Deuda anterior") → el saldo queda en rojo "Le debemos $X".
- [ ] "Registrar Pago" en efectivo con "Descontar de la caja" tildado → el saldo baja y en Caja aparece el egreso.
- [ ] Dar de baja un proveedor (pasa a "Inactivos"); reactivarlo.

## 7. Insumos (`/insumos`)

- [ ] Antes: en Configuración → categoría "Compras", revisar que existan las Unidades de Medida y Categorías de Insumo (ya vienen precargadas: Hoja, Resma, Kilo, etc.).
- [ ] Crear un insumo con unidad de stock "Hoja", unidad de compra "Resma", factor 500, y un stock inicial (ej. 1000).
- [ ] El stock queda en 1000 Hojas (= 2 Resmas).
- [ ] "Registrar movimiento": una salida de 300 dentro de lo cargado, con motivo — el stock baja correctamente.
- [ ] Un ajuste por conteo físico (motivo obligatorio) recalcula la diferencia.
- [ ] Pestaña "Historial de Movimientos": filtrar por insumo y por tipo.

## 8. Servicios y Costeo (`/configuracion/servicios`)

- [ ] Cambiar el margen por defecto (ej. a 35%) y guardar.
- [ ] Crear un servicio "Diseño gráfico" (Propio, unidad Hora, costo $8.000) — este es el que usás en la calculadora de costos del punto 2.
- [ ] Crear un servicio "Troquelado" (Tercerizado).
- [ ] Dar de baja un servicio y verificar que no aparece más como opción en la calculadora.

## 9. Compras (`/compras`)

- [ ] "Nueva Compra": elegir el proveedor y el insumo creados arriba.
- [ ] Cargar la cantidad en la unidad de compra (Resmas) — ver que muestre el equivalente en Hojas.
- [ ] El costo se precarga con el último costo cargado (si lo hay).
- [ ] Compra **al contado** en efectivo, con "Descontar de la caja": se registra el egreso en Caja y el stock del insumo sube.
- [ ] Compra **a cuenta corriente**: no toca la caja, pero sube la deuda del proveedor.
- [ ] Anular una compra (pide motivo): el stock baja lo que se había sumado y la compra queda marcada "Anulada". Si fue al contado, avisa que el pago queda como saldo a favor del proveedor.
- [ ] Crear un proveedor nuevo desde el selector de la compra (botón "Crear proveedor…").

## 10. Fechas (control cruzado, no hace falta un paso aparte)

- [ ] En cualquiera de las pantallas de arriba, las fechas que cargaste coinciden con las que se muestran (sin corrimiento de un día). Es más fácil de notar si probás algo después de las 21 hs.

---

## Qué hacer si algo falla

Anotá: la pantalla, los pasos exactos, lo que esperabas y lo que pasó. Si hay un error en rojo (toast) o en la consola del navegador (F12 → pestaña Console), copiá el texto tal cual — ayuda mucho más que una descripción.
