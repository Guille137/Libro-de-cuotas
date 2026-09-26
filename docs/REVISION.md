# Revisión técnica y prioridades

**Actualización posterior:** se implementó acceso con Google y persistencia en Firestore Spark con imágenes `Bytes`, compresión/vista previa y reglas probadas en emulador. También se renovó el diseño azul y neutro con tarjetas móviles. La configuración del proyecto real sigue pendiente. Los hallazgos siguientes describen el prototipo original; los límites vigentes están en README y ARQUITECTURA.md.

Revisión del prototipo original: 25 de septiembre de 2026. Se encontró un único `index.html`, sin backend, Firebase, autenticación, pruebas ni dependencias. Ese archivo estaba sin seguimiento en Git; se tomó como punto de partida y se conservó su identidad visual. La revisión es de código, no un pentest ni una certificación de seguridad.

## Hallazgos y cambios implementados

| Prioridad | Hallazgo original | Resolución |
| --- | --- | --- |
| Alta | Notas y datos del respaldo interpolados en `innerHTML`: XSS persistente | Construcción de elementos mediante DOM, `.textContent` y `.value`; CSP sin scripts inline |
| Alta | Regeneración copia pagos por índice y modifica sus fechas | Asociación por vencimiento; bloqueo cuando el cambio elimina cuotas con historial |
| Alta | Importación acepta cualquier arreglo y casi cualquier dato | Esquema versionado, tipos, fechas, importes, IDs únicos y límites de recursos |
| Alta | Guardado fallido solo se informa en consola | Commit antes de publicar estado; error visible; transacción para libro y comprobantes |
| Media | Fin de mes desborda al mes siguiente; UTC puede cambiar el día | Fechas civiles, límite al último día de cada mes y fecha de pago local |
| Media | Importes sumados en coma flotante | Enteros en centavos y validación de hasta dos decimales |
| Media | 60 cuotas y textos rígidos | 58 por defecto, rango de 1–600 cuotas mensuales, moneda USD/ARS/EUR |
| Media | Cambiar montos regenera la tabla durante la escritura | Persistencia al confirmar el campo mediante `change`; recuperación del foco |
| Media | Sin comprobantes ni respaldo de archivos | IndexedDB, un archivo por cuota, lectura/descarga y respaldo JSON completo |
| Media | Dos pestañas pueden sobrescribir el mismo libro | Un editor por origen mediante Web Locks |
| Media | Labels sin asociación y estado solo visual | Labels explícitos, región de estado, filtros, foco visible y tabla con encabezados |

Los libros anteriores no se recortan automáticamente de 60 a 58: el historial existente se conserva. Si un respaldo antiguo tiene fechas inconsistentes producidas por el bug de fin de mes, la migración falla de forma explícita; no inventa fechas ni sobrescribe el origen.

## Mejoras de producto, por orden

1. **Varios libros**: nombre, persona/contraparte, moneda, archivo del plan terminado y selector. Es la próxima mejora para dejar de depender de un libro activo.
2. **Pagos como movimientos**: varios pagos parciales por cuota, anticipos, saldo a favor, referencia bancaria, método, reversos y trazabilidad. El booleano actual solo cubre pago completo.
3. **Calendarios flexibles**: períodos mensuales/trimestrales, vencimientos individuales, cuotas extraordinarias, pausas y reglas explícitas de ajuste. Separar cantidad de cuotas de duración en años.
4. **Cambios con vista previa**: mostrar qué cuotas e importes cambian antes de aplicar; versionar acuerdos y ajustes con fecha efectiva.
5. **Usuarios y sincronización**: propietario, editor y lector; invitaciones y recuperación de cuenta; conflictos visibles entre dispositivos.
6. **Comprobantes avanzados**: varios por pago, originales privados, miniaturas, compresión opcional, detección de duplicados y estados de revisión. OCR como ayuda, nunca como confirmación automática de un pago.
7. **Operación cotidiana**: búsqueda, filtros por período, exportación CSV/PDF, recordatorios optativos, vista de tarjetas para móvil y modo instalable.
8. **Continuidad**: respaldos automáticos, prueba de restauración, política de retención y borrado, registro de errores sin datos bancarios.

## Límites de esta entrega

Está implementada una aplicación modular local y remota, con un libro privado por cuenta, login Google, guardado en Firestore y actualización explícita entre dispositivos. No incluye colaboración con roles, varios libros ni pagos parciales. El aislamiento local depende del perfil del navegador y del dispositivo; los archivos no tienen cifrado propio de la aplicación. El JSON exportado contiene información privada y las versiones de imágenes guardadas.

Límites intencionales: 600 cuotas, 500 KiB por nueva imagen optimizada, 200 kB de snapshot remoto, un archivo por cuota y 100 MiB por importación. Se preserva compatibilidad local con respaldos antiguos de imágenes de hasta 1 MiB y 50 MiB totales. El respaldo en Base64 consume más memoria que los archivos binarios. El navegador puede borrar almacenamiento local o rechazar escrituras por falta de espacio.

Se usa recodificación de imágenes en el navegador y validación de tipo, tamaño y firma; no es un escáner antimalware. El nuevo flujo guarda la versión optimizada tras vista previa, no el original. Las reglas y sus límites están documentados en SEGURIDAD.md.
