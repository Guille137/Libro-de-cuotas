# Seguridad y privacidad

## Controles implementados

- Autenticación con Google; reglas requieren UID propietario y email verificado.
- Rutas `users/{uid}/...` y denegación por defecto. Ningún usuario puede leer o modificar el libro ni comprobantes de otro.
- Campos permitidos, tamaños máximos, tipos, timestamps del servidor y revisión creciente comprobados en reglas.
- Imágenes inmutables: reemplazar crea un documento nuevo; evita alterar el archivo referenciado por otro estado.
- Campo binario máximo 512.000 bytes y tamaño declarado igual a `data.size()`; PNG/JPEG/WebP exclusivamente. Índices desactivados para imagen y payload.
- Validación de estructura del libro, fechas, importes, IDs, metadatos, referencias y límites en el cliente antes de guardar y después de leer.
- Transacciones con revisión esperada para impedir sobrescritura silenciosa entre dispositivos; errores de guardado visibles.
- Texto externo en DOM mediante `.textContent`/`.value`, nunca HTML interpolado. CSP y encabezados en Hosting; SDK empaquetado, sin scripts inline.
- Recodificación de imágenes desde canvas, límite de entrada de 15 MiB y 24 megapíxeles, tamaño final de 500 KiB y vista previa de legibilidad. Recodificar evita trasladar los metadatos EXIF del original.
- Caché remota solo en memoria, vaciada al cerrar sesión; archivos bajo demanda sin URLs públicas de descarga. Exportaciones privadas explícitas.
- Libro local y libro remoto separados; copiar hacia la cuenta requiere una acción y confirmación explícitas.

## Límites que siguen existiendo

Las reglas validan el sobre del snapshot (`payload`, revisión y fecha), pero **no interpretan su JSON**. La validación semántica se hace en la app. Un propietario puede manipular sus propios datos con otro cliente; esto es un libro personal y no un sistema de auditoría bancaria ni contabilidad compartida. Si se agregan roles o aprobación de pagos, será necesario cambiar el modelo y validar invariantes en servidor/reglas por entidad.

El tipo MIME declarado y la firma no prueban la legitimidad de un comprobante. La recodificación del flujo normal produce una imagen visible, pero las reglas no decodifican ni escanean bytes. No existe antivirus en servidor ni OCR que confirme el pago. La captura no demuestra acreditación; el usuario marca el pago manualmente.

Auth y reglas evitan acceso cruzado, pero no son un límite global de consumo por usuario. Un usuario autenticado puede agotar parte de las cuotas compartidas de Spark creando sus propios documentos. Para uso privado estricto, restringir `owner(uid)` al UID del titular después del primer login. Para una publicación abierta, añadir App Check y controles de abuso antes de difundirla. El proveedor puede bloquear operaciones al superar cuotas.

Una caída durante cargas/borrados puede dejar imágenes huérfanas. Se intenta limpiar lo preparado sin borrar archivos que todavía estén referenciados; si no hay conectividad no se garantiza la limpieza. Revisar documentos no referenciados en `users/{uid}/receipts` antes de borrarlos, con una exportación previa. Borrar una cuenta de Authentication por consola no elimina automáticamente sus documentos: borrar primero libro y archivos y después la cuenta según la política de retención.

En modo local, cualquiera con acceso al mismo perfil de navegador puede acceder al libro. No hay cifrado propio; el JSON exportado contiene datos e imágenes sin cifrar. Guardar copias en un lugar privado. Alojar la app en un origen dedicado para que otras aplicaciones del mismo origen no compartan acceso a IndexedDB.

## Configuración de producción

Usar HTTPS, habilitar Google y dominios autorizados, publicar `firestore.rules` y `firestore.indexes.json` antes del sitio. Nunca usar reglas de prueba abiertas. La configuración web de Firebase es pública; claves de cuentas de servicio, tokens y credenciales administrativas no deben entrar al frontend ni al repositorio.

La CSP permite los servicios Firebase/Auth requeridos y el iframe de autenticación de Firebase. Si se usa un dominio de autenticación personalizado, ajustar tanto el meta CSP como el encabezado de `firebase.json` al dominio exacto. No resolver problemas de conexión eliminando toda la CSP.

## Verificaciones

Las pruebas de emulador comprueban anónimo denegado, email no verificado denegado, usuario A aislado de B, campos adicionales, revisión incorrecta, límites de archivos, tipos no permitidos e inmutabilidad. También ejercitan el repositorio real, recuperación de Bytes, conflictos, restauración, borrado de archivos anteriores y un libro con 58 imágenes.

Las pruebas de Chrome verifican que una nota con HTML siga siendo texto, que la imagen optimizada pueda visualizarse y que un respaldo restaure sus bytes. No equivalen a un pentest. El login OAuth real y la configuración de producción quedan pendientes de disponer del proyecto del usuario.

Referencias: [Reglas de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions), [tipos de reglas](https://firebase.google.com/docs/reference/rules/rules.Bytes), [App Check](https://firebase.google.com/docs/app-check).
