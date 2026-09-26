# Firestore Spark: configuración y costos

La implementación usa **Firebase Authentication + Firestore Standard**. No usa Cloud Storage ni Cloud Functions. Las imágenes optimizadas se guardan como `Bytes`, un tipo nativo de Firestore. Esto permite mantener Spark para esta miniapp. [Tipos admitidos](https://firebase.google.com/docs/firestore/manage-data/data-types).

## Configurar tu proyecto

1. Crear o elegir un proyecto de Firebase en **Spark**. No habilitar una cuenta de facturación para esta solución.
2. Registrar una aplicación web en Configuración del proyecto. Copiar `apiKey`, `authDomain`, `projectId` y `appId` en `src/config/firebase-config.js`, reemplazando `null` por el objeto público. No incluir claves de cuentas de servicio.
3. En Authentication, habilitar el proveedor **Google** y establecer el correo de soporte. Añadir `localhost` y el dominio de despliegue a los dominios autorizados si no están presentes.
4. Crear Firestore **Standard**, base `(default)`, en modo producción. Elegir región considerando la ubicación del usuario. Esta solución de Firestore no depende de las regiones gratuitas de Cloud Storage.
5. Instalar Firebase CLI si no está disponible y ejecutar:

```sh
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
npm ci
npm run build
firebase deploy --only hosting
```

Seleccionar cuidadosamente el proyecto al ejecutar `firebase use --add`. El repositorio trae `.firebaserc` asociado a `libro-cuotas-guille137`; cambiarlo solo si se publica en otro proyecto propio. Los comandos publican reglas e índices y luego el sitio; no despliegan Functions ni Storage. Esperar a que los índices/configuración estén listos antes de usar imágenes en producción.

6. Abrir la app, conectar con Google y crear/usar el libro de la cuenta. El libro local no se sube sin pulsar **Copiar libro local a mi cuenta**.

La cuenta de Google debe tener email verificado, condición comprobada por las reglas. [Acceso con Google](https://firebase.google.com/docs/auth/web/google-signin).

## Espacio y consumo

- Cada imagen: máximo **500 KiB** (512.000 bytes), dejando margen frente al límite de documento de 1 MiB.
- 58 imágenes al máximo: **28,3 MiB**, más campos y documentos del libro.
- Libro: un documento con snapshot JSON limitado a 200.000 bytes en el cliente y revisión. El contenido no se indexa.
- Imágenes: un documento por captura; contenido binario excluido de índices en `firestore.indexes.json`.
- Apertura del calendario: lectura del libro; no descarga los 58 archivos.
- Abrir un comprobante: una lectura de su documento si no está en la memoria de esta sesión.
- Exportar: descarga todos los comprobantes que falten en memoria.

Firestore tiene una cuota gratuita de 1 GiB almacenado, 50.000 lecturas/día, 20.000 escrituras/día, 20.000 eliminaciones/día y 10 GiB/mes de transferencia saliente, con condiciones por proyecto/base. Es holgado para un libro personal usado moderadamente; son cuotas compartidas con los demás datos y aplicaciones del proyecto. [Límites oficiales](https://firebase.google.com/docs/firestore/quotas).

No es una promesa de disponibilidad gratuita durante cinco años: las condiciones del proveedor pueden cambiar. Mantener exportaciones independientes. En Spark, alcanzar cuotas puede impedir operaciones; la app no habilita Blaze ni cambia de plan automáticamente.

## Qué cambió respecto de la recomendación inicial

Cloud Storage continúa exigiendo Blaze, pero **no se utiliza aquí**. La solución elegida es Firestore para un conjunto pequeño de imágenes, una alternativa válida para este alcance. No fragmentamos imágenes grandes en muchos documentos ni guardamos todas las capturas juntas. Base64 se usa únicamente dentro de los respaldos JSON; la nube utiliza `Bytes`. [Requisito de Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

## Errores habituales

- **Nube por configurar**: completar el archivo público y reconstruir el sitio.
- **auth/unauthorized-domain**: agregar el dominio en Authentication.
- **auth/operation-not-allowed**: habilitar Google como proveedor.
- **permission-denied**: comprobar proyecto, reglas publicadas, sesión y email verificado. No solucionar abriendo las reglas a todos.
- **resource-exhausted**: revisar cuotas del proyecto; evitar reintentos continuos.
- **Otro dispositivo cambió el libro**: actualizar desde la nube y volver a aplicar la edición.
- **Imagen mayor de 500 KiB en respaldo antiguo**: volver a adjuntarla mediante la vista previa de optimización y exportar de nuevo.

El proyecto `libro-cuotas-guille137`, su app web y Firestore Standard gratuito ya están creados. Las reglas e índices se publicaron. La CLI creó la base en `nam5` al desplegar; la solicitud inicial de São Paulo no llegó a crear una base porque la API aún estaba deshabilitada. No se probó un login real: falta habilitar Google en Authentication.
