# Publicar en Vercel con Firebase

La app usa Vercel para servir archivos estáticos y Firebase Authentication + Firestore para la cuenta y los comprobantes. No necesita un servidor propio, Functions ni Cloud Storage.

## Estado de este repositorio

- Proyecto creado: `libro-cuotas-guille137` (sin facturación activada).
- App web registrada y configuración pública incorporada.
- Firestore Standard gratuito, base `(default)` en `nam5`, con reglas e índices publicados.
- Pendiente: habilitar Google en Authentication, publicar en Vercel y autorizar su dominio.
- Vercel no tiene una sesión iniciada en el entorno de trabajo.

Los pasos siguientes sirven también para configurar otro proyecto; no hace falta volver a crear el actual.

## 1. Firebase

1. Crear un proyecto Spark y registrar una aplicación web.
2. Completar el objeto público de `src/config/firebase-config.js` con `apiKey`, `authDomain`, `projectId` y `appId`. No usar credenciales privadas ni cuentas de servicio. Esta configuración se incluye en el navegador; la protección de datos depende de Authentication y las reglas.
3. Activar Authentication → Google y elegir el correo de soporte.
4. Crear Firestore Standard, base `(default)`, en modo producción.
5. Desde este repositorio, publicar las reglas y exclusiones de índices:

```sh
firebase login
firebase deploy --project TU_PROJECT_ID --only firestore:rules,firestore:indexes
```

Reemplazar `TU_PROJECT_ID` por el identificador del proyecto propio. No usar el proyecto de pruebas `demo-libro-cuotas`. Consultar los límites en [FIREBASE-Y-COSTOS.md](FIREBASE-Y-COSTOS.md).

## 2. Vercel

1. Guardar la configuración pública de Firebase en Git y subirla al repositorio.
2. En Vercel, importar `Guille137/Libro-de-cuotas` desde GitHub, con la raíz del repositorio como Root Directory.
3. `vercel.json` configura Other, instalación `npm ci`, compilación `npm run build`, salida `dist` y encabezados de seguridad. No hacen falta variables de entorno con la implementación actual.
4. Publicar y copiar el dominio de producción.
5. En Firebase Authentication → Settings → Authorized domains, agregar ese dominio sin `https://` ni rutas. Agregar también el dominio propio si se configura uno. Para pruebas locales, agregar `localhost` si no figura.

La configuración está basada en la [documentación de Vercel](https://vercel.com/docs/project-configuration/vercel-json). Los encabezados de `firebase.json` solo corresponden a Firebase Hosting; para Vercel se mantienen en `vercel.json`. No hace falta desplegar ambos servicios de hosting.

## 3. Verificación en producción

- Abrir la URL por HTTPS e iniciar sesión con Google.
- Crear un título y registrar un pago; recargar y comprobar que persisten.
- Adjuntar una imagen, abrirla desde otro dispositivo con la misma cuenta y comprobar su legibilidad.
- Exportar una copia de seguridad. Para trasladar datos que solo están en el navegador, usar **Copiar libro local a mi cuenta** y revisar la confirmación.
- Comprobar que otra cuenta abre su propio libro.

Si `firebaseConfig` sigue siendo `null`, el sitio publicado funciona solo en modo local. Las pruebas del emulador no sustituyen esta verificación del acceso con Google y del proyecto real.
