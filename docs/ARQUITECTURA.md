# Arquitectura de la miniapp

## Alcance decidido

Un libro personal por cuenta, normalmente de 58 cuotas. Se implementa un monolito modular de frontend con acceso autorizado a Firebase, sin servidor propio ni microservicios. Las reglas de Firestore son la barrera de autorización. El almacenamiento remoto está diseñado para esta escala, no como plataforma contable multiempresa.

```text
src/main.js                         Composición, eventos, cuenta y modo activo
src/ui/view.js                      Renderizado seguro y progreso
src/ui/ledger-model.js              Filtros, búsqueda, fechas y paginación
src/ui/dialogs.js                   Confirmaciones accesibles
src/ui/theme.js                     Tema previo al render y preferencia local
styles/main.css                     Diseño azul y neutro y tarjetas móviles
styles/themes.css                   Paletas clara/oscura y contraste
src/domain/plan.js                  Fechas, dinero, calendario, esquemas
src/application/book-service.js     Casos de uso independientes del repositorio
src/infrastructure/indexed-db.js    Libro local y archivos en transacción
src/infrastructure/firebase-client.js       Auth Google y SDK
src/infrastructure/firestore-repository.js  Libro remoto y Bytes
src/infrastructure/image-processing.js      Optimización y recodificación
src/infrastructure/receipts.js              Validación y codec de respaldos
src/config/firebase-config.js       Configuración pública del proyecto
firestore.rules                     Aislamiento por usuario y límites
firestore.indexes.json              Exclusiones del contenido de archivos
```

`BookService` recibe un repositorio con `load`, `commit`, `readReceipt` y `snapshot`. El dominio no depende de DOM ni Firebase. El servicio solo publica cambios después del commit. El SDK se empaqueta con esbuild y dependencias fijadas, sin importar código remoto arbitrario por CDN.

## Datos remotos

```text
users/{uid}/books/main
  payload: JSON del estado validado, sin imágenes (máximo 200 kB)
  revision: entero creciente
  updatedAt: timestamp del servidor

users/{uid}/receipts/{uuid}
  data: Bytes (máximo 500 KiB)
  type: image/webp | image/png | image/jpeg
  size: entero igual al tamaño binario
  name: nombre de archivo
  createdAt: timestamp del servidor
```

El snapshot pequeño es una decisión explícita para un libro personal: una lectura abre todo el calendario y una revisión controla conflictos. Las capturas viven separadas, por lo que no acercan el libro al límite de documento. Si posteriormente se necesitan miles de cuotas, colaboración simultánea o consultas entre libros, separar cuotas y movimientos en colecciones.

## Escritura y concurrencia

1. Validar estado, archivos y límites antes de comenzar.
2. Crear documentos de imagen independientes, con UUID nuevos e inmutables.
3. Confirmar en una transacción el snapshot con `revision` esperada. Un cambio ajeno se rechaza sin sobrescribirlo.
4. Actualizar la vista solo tras confirmación del servidor.
5. Eliminar imágenes reemplazadas después de confirmar la nueva referencia.

Las importaciones con 58 imágenes se cargan por documento; no forman una transacción de decenas de megabytes. Una restauración asigna IDs nuevos para no pisar archivos de una revisión existente. Si falla una subida se intenta limpiar lo preparado. Si se pierde la respuesta de la transacción, se consulta al servidor antes de declarar fallo o borrar archivos. La limpieza puede quedar incompleta por desconexión/cierre de pestaña: revisar objetos huérfanos antes de eliminarlos, comparando sus IDs con el snapshot activo. No hay tareas programadas de pago.

## Lecturas y sesiones

El calendario no descarga imágenes; el visor las pide por ID al abrirse y conserva caché en memoria. Exportar genera una copia coherente del libro cargado y sus imágenes. La caché remota no es persistente y se descarta al salir. El libro local y el de la cuenta están separados. No se suben automáticamente los datos locales al iniciar sesión.

La nube requiere conexión; no hay una cola propia de sincronización offline ni fusión silenciosa de versiones. Se usa **Actualizar desde la nube** para cambios de otros dispositivos. Web Locks impide dos editores simultáneos del mismo origen dentro del navegador. Entre dispositivos se protege con transacciones/revisiones.

## Comprobantes

Optimización en el navegador a WebP (o PNG si el navegador no codifica WebP), máximo 500 KiB, ajuste gradual de tamaño/calidad y vista previa obligatoria. No se fuerza una compresión extrema: si no alcanza el límite, se pide recortar la imagen. Se conserva la versión optimizada; la app no archiva también el original. Los respaldos serializan las imágenes como Base64, pero Firestore usa binario.

## Validación

Pruebas de dominio y límites; integración con Emulator Suite para reglas, aislamiento entre dos usuarios, escritura de Bytes, restauración, limpieza y conflictos; Chrome para persistencia local, preview, compresión, exportación y ancho móvil. El acceso OAuth real requiere configurar el proyecto y dominio antes de validarlo en producción.

## Evolución posible

Varios libros, pagos parciales como movimientos, anticipos, exportación CSV/PDF, recordatorios optativos y ajustes con vista previa. No son necesarios para el flujo actual y no se presentan como funciones implementadas.
