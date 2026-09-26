# Cuotas · Tu libro de pagos

Miniapp de cuotas con diseño azul y neutro, 58 cuotas mensuales por defecto, calendario configurable, monedas USD/ARS/EUR, notas y comprobantes. Funciona localmente y puede guardar el libro y las imágenes en **Firestore con el plan Spark**, sin Cloud Storage ni Cloud Functions.

## Acceso

La portada ofrece Google, correo y contraseña, o modo local. El registro por correo requiere verificar el email antes de abrir el libro en la nube. Incluye recuperación de contraseña y reenvío de verificación. En Firebase Authentication deben estar habilitados los proveedores Google y Correo/contraseña; el proveedor de correo fue comprobado como habilitado en el proyecto actual.

## Uso cotidiano

- La tarjeta principal muestra la primera cuota pendiente y prioriza las vencidas. **Registrar pago** abre un formulario; revisar monto/fecha y pulsar **Guardar pago**. No realiza transferencias ni admite pagos parciales.
- **Detalle / Ver detalle** permite corregir monto, estado, fecha y nota. Los cambios se guardan juntos; cancelar no los aplica. Si falla el guardado, el formulario conserva el borrador.
- Adjuntar un comprobante es independiente del pago: la imagen se confirma en su propia vista previa. Se puede agregar antes o después de registrar el pago.
- Los filtros visibles, la búsqueda por número/fecha/nota y las páginas de 12 cuotas evitan recorrer el calendario completo.
- **Configurar plan** muestra una revisión de cambios antes de aplicarlos. **Cuenta y copias de seguridad** reúne conexión, exportación y restauración; el borrado está separado y requiere escribir BORRAR.
- El selector **Tema** ofrece Claro y Oscuro. Recuerda la preferencia en este navegador y aplica el tema antes de dibujar la página.

Ver [decisiones de experiencia de usuario y comprobaciones](docs/EXPERIENCIA-DE-USUARIO.md).

## Ejecutar

Node.js 22 o superior:

```sh
npm ci
npm run dev
```

Abrir http://localhost:5173. El servidor compila al arrancar; reiniciarlo después de editar código. No abrir el HTML mediante `file://`.

```sh
npm test
npm run build
npm run test:browser
npm run test:rules
```

- `npm test`: dominio y límites del almacenamiento remoto.
- `npm run test:browser`: Chrome sin interfaz y perfil temporal; `CHROME_PATH` permite indicar otro ejecutable. Puertos 5173 y 9227 libres. Genera capturas en `artifacts/` (ignorado por Git).
- `npm run test:rules`: emulador local de Firestore, sin producción; requiere Firebase CLI y Java 21+. Comprueba aislamiento entre usuarios, reglas, imágenes, restauración y conflictos.
- `npm run build`: crea `dist/`, incluido el SDK de Firebase empaquetado; las versiones están fijadas en `package-lock.json`.

## Activar Firebase gratuito

Para publicar en Vercel, seguir [la guía de despliegue](docs/DESPLIEGUE.md). El repositorio incluye `vercel.json` con la compilación, el directorio de salida y los encabezados de seguridad.

El proyecto `libro-cuotas-guille137` está vinculado mediante `.firebaserc` y `src/config/firebase-config.js`. Firestore Standard y sus reglas e índices están publicados. La base gratuita está en `nam5`. Falta habilitar el acceso con Google en la consola y publicar el frontend; ver [la guía de despliegue](docs/DESPLIEGUE.md).

Una vez configurado, conectar con Google abre el libro privado de esa cuenta. El libro local se mantiene separado; el botón **Copiar libro local a mi cuenta** permite trasladarlo explícitamente. En nube, cada cambio se confirma con el servidor; **Actualizar desde la nube** trae cambios de otros dispositivos. Un conflicto de revisión bloquea la sobrescritura. Salir vuelve al libro local.

## Comprobantes

Seleccionar PNG, JPEG o WebP de hasta 15 MiB. La app genera una versión optimizada de hasta **500 KiB** y pide revisar su legibilidad antes de guardar. Solo se conserva esa versión en el libro; conservar aparte el original si es necesario. Adjuntar un comprobante no marca un pago automáticamente.

Cada imagen remota usa su propio documento con campo `Bytes`, sin índices sobre el contenido. Se descarga al abrirla o exportar el respaldo; no al cargar el calendario. 58 imágenes de 500 KiB ocupan unos 28,3 MiB, más los metadatos. El respaldo JSON contiene las cuotas y las imágenes, sin cifrado propio.

Se admite un libro por cuenta, 1–600 cuotas mensuales y un archivo por cuota. El libro remoto admite hasta 200 kB de texto y referencias, independiente de las imágenes. En local se mantienen los límites anteriores de 1 MiB por archivo importado y 50 MiB en total. Para copiar respaldos antiguos a la nube, reemplazar primero las imágenes que superen 500 KiB usando el nuevo flujo de optimización.

## Documentación

- [Arquitectura actual](docs/ARQUITECTURA.md)
- [Configuración Firebase y costos](docs/FIREBASE-Y-COSTOS.md)
- [Seguridad y límites](docs/SEGURIDAD.md)
- [Revisión y próximas mejoras](docs/REVISION.md)

La integración está implementada y probada en emulador. El proyecto real ya tiene configuración pública y reglas; el acceso con Google aún requiere habilitar el proveedor y comprobarlo en producción. No se activó facturación.

El botón **Editar título**, junto al nombre del libro, permite usar hasta 80 caracteres. El título se conserva al ajustar el calendario y al exportar/restaurar copias. Los libros anteriores reciben el nombre «Mi libro de cuotas» sin cambiar sus pagos.
