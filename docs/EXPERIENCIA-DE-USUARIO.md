# Experiencia de usuario

## Recorridos implementados

La pantalla abre con el plan, su próxima acción y los saldos. Se redujo el encabezado promocional y se retiraron las filas editables: consultar una cuota ya no cambia su importe ni su estado por accidente.

1. **Registrar pago:** abrir una cuota pendiente, revisar importe y fecha y guardar. Los cuatro campos de detalle se confirman en una sola operación. Solo se admiten pagos completos; editar monto cambia el importe de la cuota.
2. **Corregir información:** abrir Detalle, modificar y guardar. Cancelar un borrador pide confirmación y preserva las imágenes que se hayan guardado por separado. Un error deja el formulario abierto con los valores escritos y un mensaje cercano.
3. **Adjuntar comprobante:** seleccionar imagen, revisar la copia optimizada y confirmar. Una imagen nunca cambia automáticamente el estado de pago. Si la subida falla, la vista previa queda disponible para reintentar.
4. **Encontrar cuotas:** filtros con cantidades, búsqueda por número/fecha/nota y páginas de 12. Las cuotas mantienen su número original. No se muestra un mensaje de “todo al día” cuando simplemente no hay coincidencias.
5. **Modificar calendario:** validar y mostrar cantidad, fechas, total y cuotas afectadas antes de confirmar. Cambios que eliminarían historial se rechazan antes de pedir confirmación.
6. **Recuperar o borrar:** copias y cuenta agrupadas; reemplazos explican el destino local/remoto. Borrar requiere escribir BORRAR. No se promete recuperación sin copia.

## Jerarquía y lenguaje

La tarjeta principal prioriza la primera cuota pendiente, incluidas las vencidas. El saldo por pagar aclara que ya incluye la deuda vencida para evitar sumar dos veces. Fechas legibles en español; moneda explícita; estado expresado con texto y color. Configuración y administración permanecen en secciones desplegables, separadas del trabajo habitual.

Los mensajes de guardado permanecen visibles al desplazarse. El usuario ve si trabaja en el dispositivo o en su cuenta. Se oculta el botón de conexión cuando la aplicación aún no tiene configuración Firebase, manteniendo una explicación en Cuenta y copias de seguridad.

## Temas y accesibilidad

Paletas azul y neutra para Claro y Oscuro, las únicas dos opciones. Estética futurista con cuadrícula tenue, acentos luminosos y formas orbitales decorativas creadas en CSS, sin imágenes ni fuentes externas. Los datos y las acciones conservan superficies legibles; el color cambia de inmediato entre temas para evitar pérdidas temporales de contraste. Las transiciones respetan la preferencia de movimiento reducido. Preferencia persistida localmente; el tema inicial es Claro. Una preferencia antigua Sistema se convierte en Claro y los cambios del sistema operativo no alteran la selección. El tema se aplica antes del CSS para evitar un destello al cargar. Si el navegador bloquea almacenamiento, la selección sigue funcionando durante la sesión.

Etiquetas de formulario asociadas, foco visible, cuadros de diálogo con nombres accesibles, restauración del foco, enlace para saltar a las cuotas, estados anunciados y controles principales de al menos 44 px. Los diálogos previenen el cierre durante el guardado. La interfaz se adapta a pantallas de 320 px sin desbordar horizontalmente.

Referencias utilizadas: [tamaño de objetivos de interacción de W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) y [notificaciones de formularios accesibles](https://www.w3.org/WAI/tutorials/forms/notifications/).

## Verificación y límites

`npm run test:browser` comprueba flujos reales en Chrome: búsqueda, paginación, pago explícito, cancelación, error de almacenamiento con borrador preservado, imagen, respaldo, revisión de calendario, borrado protegido y temas. Axe revisa doce combinaciones de pantallas/estados, incluyendo escritorio, móvil, formularios claros/oscuros y formularios a 320 px y en orientación horizontal, sin infracciones detectadas en esas comprobaciones.

Las pruebas de dominio cubren filtros, búsqueda y guardado conjunto del detalle. Las capturas de `artifacts/` permiten inspeccionar el resultado. La revisión automática no certifica conformidad integral con WCAG ni reemplaza pruebas con lectores de pantalla, dispositivos físicos y personas usuarias. No se realizaron estudios de usabilidad con usuarios reales.

La presentación compacta reduce espacios y alturas de tarjetas. En celulares, el avance ocupa una franja breve, los filtros se distribuyen en cuatro columnas y las cuotas conservan acciones de 44 px. Los campos usan 16 px para evitar zoom automático al escribir; se respetan las áreas seguras y la altura dinámica de la pantalla. El aviso de guardado no queda fijo sobre el contenido en móvil.
