# Encuadre

Extensión de Chrome para probar el diseño de una página en distintos tamaños y capturar su pantalla o su contenido vertical completo. Implementa P0 y las ampliaciones de edición, ocultado y emulación de [FUNCIONALIDADES.md](./FUNCIONALIDADES.md).

La interfaz usa **React, TypeScript, Tailwind CSS y componentes de shadcn/ui sobre Radix**. La marca es **Encuadre** en todos los idiomas. No requiere cuenta, suscripción ni servicios externos.

Los textos internos se mantienen en `src/locales/`, separados por área, con los mensajes reutilizados en `common.ts`. El traductor compartido de `src/lib/i18n.ts` valida las claves y las variables con TypeScript, conserva el español como texto fuente y adapta números y fechas al idioma. Para agregar o cambiar un texto, actualizá su entrada en el catálogo y usá `t()` en la interfaz.

## Instalación local

La extensión incluye íconos propios para la barra de Chrome, la administración de extensiones y las pestañas. La versión se mantiene en `package.json`. El nombre, la descripción breve, el texto del ícono en páginas compatibles y la descripción del atajo se traducen con los catálogos de `public/_locales/`: **Encuadre — Capturas de página completa** en español y **Encuadre — Full Page Screenshots** en inglés. Chrome elige según su idioma y usa inglés como respaldo para otros idiomas. El build incorpora los catálogos y sus referencias al manifiesto. La interfaz interna, los mensajes de captura y los avisos de páginas restringidas también están disponibles en español e inglés, según el idioma de Chrome. Para regenerar los PNG desde `public/icons/encuadre.svg`, ejecutá `npm run icons` (requiere el Chromium de Playwright instalado).

Los textos preparados para la distribución están en [FICHA-TIENDA.md](./FICHA-TIENDA.md) y [PRIVACIDAD.md](./PRIVACIDAD.md). La publicación en la tienda todavía requiere completar los datos del responsable y los recursos indicados en la ficha.

Requisitos: Node.js 22.12 o superior y Chrome 125 o superior.

```powershell
npm ci
npm run build
```

1. Abrí `chrome://extensions` en Chrome.
2. Activá **Modo de desarrollador**.
3. Elegí **Cargar extensión sin empaquetar** y seleccioná `C:\Workspace\full-page-capture\dist`.
4. Abrí una página HTTP, HTTPS o localhost y presioná el ícono de Encuadre.
5. Elegí un modelo concreto. **Abrir teléfono con marco** muestra el celular en la misma pestaña, sobre un fondo oscuro, con los controles a la derecha. Conserva la dirección del sitio en la barra del navegador. El celular carga una instancia del sitio dentro de la vista: podés hacer clic, escribir, desplazarte y cambiar de modelo. La página original permanece debajo y se recupera al cerrar la vista.
6. Usá **Capturar página completa** o **Capturar pantalla** desde el popup o desde el simulador. En las capturas visibles de teléfonos y tablets podés elegir **Con marco** o **Solo página**; la captura completa siempre conserva el contenido como tira vertical sin marco.
7. Revisá el resultado y descargalo en PNG, JPEG o PDF, o copialo al portapapeles. **Opciones de PDF** permite elegir hojas A4, orientación, márgenes de 0 a 30 mm o una sola página larga. Estas preferencias se guardan para la próxima captura.

Tras cambiar el código, ejecutá `npm run build` y recargá la extensión desde `chrome://extensions`. El servidor de desarrollo permite revisar la interfaz, pero las capturas necesitan la extensión instalada.

Los marcos se optimizan con `npm run optimize:frames`: comprime PNG sin pérdida, verifica cada imagen modificada píxel por píxel y unifica referencias a archivos idénticos en el catálogo. Los originales del catálogo de importación permanecen en `public/frames`; el build incluye solo los recursos referenciados. La optimización redujo los marcos distribuidos de 111,7 MB a 86,6 MB (620 a 404 archivos), conservando todos los modelos y acabados.

**Ver última captura** vuelve a la pestaña del resultado sin duplicarla. En el visor, **Cancelar edición** descarta todos los cambios de la sesión de edición y recupera la imagen original y su presentación anterior, con marco o solo página.

El atajo sugerido es `Alt+Shift+S`. Chrome puede reservarlo o tener un conflicto con otra extensión; se configura en `chrome://extensions/shortcuts`.

El clic derecho sobre un sitio muestra **Encuadre**, con accesos a **Capturar página completa**, **Capturar pantalla**, **Abrir vista de celular** y **Volver a escritorio**. Las capturas usan la vista actual de esa pestaña. La vista de celular usa el modelo móvil guardado o un iPhone 13 si no hay uno seleccionado. Después de actualizar, recargá la extensión para registrar el menú. El permiso `contextMenus` permite agregar estos accesos; elegirlos también concede acceso temporal al sitio mediante `activeTab`.

## Implementación de la P0

- Popup de Chrome de 720 × 600 píxeles, con controles en dos columnas y acciones de captura siempre visibles. Se adapta a ventanas más angostas. El trabajo continúa si el popup se cierra; al abrirlo nuevamente muestra el estado.
- El tamaño preferido se declara directamente en el `body` del popup, sin límites basados en su viewport inicial. El contenido se ajusta a la altura que Chrome permite; los controles principales también entran en 510 píxeles de alto. Los tamaños propios se despliegan en la columna de exportación.
- Modelos de iPhone del X en adelante, con selector de color, rotación y medidas visibles. El iPhone 15 conserva rosa como opción inicial; consultar el [catálogo completo y los acabados pendientes](./IPHONE-MOCKUPS.md). También incluye Galaxy S24, S24 Ultra, Pixel 8, iPad Air, escritorio y tamaños propios guardados.
- Marcos de imagen por modelo, con sus bordes, materiales, botones y cámaras. La barra de estado ilustrativa agrega hora, señal, Wi-Fi y batería. La vista y la exportación comparten la misma máscara para conservar las curvas, el notch y la isla sin derramar contenido fuera del equipo. Los recursos están incluidos localmente; consultar [sus fuentes y condiciones](./FRAME-CREDITS.md).
- Simulador dentro de la pestaña original, con fondo oscuro, marco centrado y controles de shadcn a la derecha. La página móvil se renderiza en un iframe con sus dimensiones CSS reales, con interacción directa y barras de desplazamiento ocultas. Cambiar modelo, orientación o ampliación conserva el documento móvil. La página original conserva su estado para volver a ella al cerrar la vista.
- Colores de las barras del dispositivo a partir de `meta[name="theme-color"]` y del manifiesto de la PWA (`theme_color` y `background_color`), con contraste automático de los indicadores. Se respetan las condiciones de medios del metadato; sin colores declarados se usa el fondo de la página. La vista previa y el archivo exportado comparten esos colores.
- Captura visible con marco opcional, exportable y copiable en PNG o descargable en JPEG; el exterior es transparente en PNG y blanco en JPEG. Tanto el contenido como la presentación se generan a 2× para conservar nitidez. La página completa se exporta sin marco.
- Viewport CSS propio dentro del simulador, densidad real y User-Agent móvil según el dispositivo. Elegir un modelo abre esa vista en la pestaña actual; cambiarlo conserva el documento móvil.
- Ajuste visual y ampliación separados del ancho CSS; comprobación del tamaño aplicado antes de darlo por válido.
- Captura visible o completa, espera acotada de fuentes e imágenes y recorrido para activar carga diferida.
- Captura de escritorio mediante `chrome.tabs.captureVisibleTab`, sin conectar el depurador. La captura móvil usa `Page.captureScreenshot` de Chrome DevTools Protocol, con el depurador que ya utiliza el emulador. Los segmentos se unen localmente en una sola imagen, sin repetir los elementos fijos y manteniendo los elementos adherentes en su posición natural.
- Captura móvil a 1×, 2× o 3× (2× por defecto), renderizada a la resolución de exportación en lugar de ampliar una imagen de menor resolución. Incluye las partes del celular que exceden el área visible; el viewport CSS del sitio conserva sus dimensiones. La presentación con marco se compone a 2×; las capturas de solo página usan la densidad elegida, dentro de los límites de imagen.
- Progreso, cancelación, restauración del desplazamiento y estilos temporales mediante `finally`.
- Límite de recorrido de 20 segundos o 30.000 píxeles; aviso de resultado parcial al alcanzarlo.
- Reducción proporcional de imágenes que superan 24 millones de píxeles o 16.000 píxeles por lado, con aviso y dimensiones reales.
- Visor con ampliación, ajuste al ancho, descarga PNG/JPEG, calidad JPEG y copia en PNG con alternativa de descarga. Las imágenes con marco se muestran completas por defecto y se ajustan al ancho y al alto disponibles; **Al ancho** y **1:1** permiten ampliarlas sin cambiar la resolución de descarga.
- Nombres de archivo con sitio, perfil, orientación y fecha, sin parámetros de URL.
- Preferencias locales, repetición de captura y regreso a la pestaña de origen.
- Mensajes de páginas restringidas, acceso al sitio, pestañas perdidas y recursos insuficientes. Cambiar de pestaña durante una captura la interrumpe para evitar registrar otra página.
- Controles de shadcn con navegación por teclado y textos en español.

## Permisos y datos

El ícono se muestra verde en sitios compatibles y gris con una barra en páginas restringidas, donde el botón queda deshabilitado. Al pasar el cursor muestra el motivo. Se actualiza al navegar y cambiar de pestaña. El permiso `tabs` permite consultar las direcciones para decidir ese estado antes de abrir el popup; estas consultas no se guardan como historial ni se transmiten. La inyección y captura siguen requiriendo el acceso temporal de `activeTab`.

`activeTab` concede acceso temporal al sitio cuando el usuario abre Encuadre desde su ícono o invoca el atajo. `scripting` permite leer las medidas y colores, preparar el contenido y restaurar sus estilos y desplazamiento. La captura usa `tabs.captureVisibleTab`, con un intervalo mínimo de 550 ms entre llamadas para respetar el límite de Chrome. Capturar escritorio no conecta al depurador. **Abrir emulador de celular** activa directamente `debugger` para aplicar densidad, User-Agent y entrada táctil, conservando el teléfono con marco dentro de la página; no requiere parámetros especiales al iniciar el navegador.

Los controles usan el popup nativo de la acción de Chrome; no se solicita `sidePanel`. `storage` recuerda preferencias y el estado de la sesión, y `clipboardWrite` habilita copiar la imagen. No se solicitan permisos de lectura permanente de todos los sitios, acceso al historial ni permisos de descargas.

El simulador carga el sitio dentro de una vista local de la extensión en la misma pestaña. `declarativeNetRequestWithHostAccess` aplica una regla temporal para permitir la incrustación: retira `X-Frame-Options` y `Content-Security-Policy` únicamente de respuestas de subframes del origen autorizado y de esa pestaña. La regla se elimina al cerrar la vista, cambiar la página o cerrar la pestaña. No se interceptan ni reescriben los cuerpos de las respuestas. **Volver a escritorio** o la cruz recuperan la página original.

La imagen se procesa localmente. IndexedDB conserva únicamente el resultado temporal actual para transferirlo del service worker al visor; otra captura lo reemplaza. Se elimina al cerrar su pestaña de resultado o al reiniciar Chrome. No hay biblioteca ni historial automático. Los archivos que descargues y las imágenes que copies quedan bajo el control del navegador y del sistema operativo.

En escritorio, la pestaña de origen debe permanecer activa durante la captura. En el emulador, el resultado se abre desde el inicio con el progreso y la opción de cancelar; la captura se genera en la pestaña de origen, detrás del resultado, para evitar mostrar el cambio temporal del marco. Al terminar o cancelar, se restauran el marco, las medidas y el desplazamiento. No se recarga ni se navega el documento móvil. Cerrar el resultado mientras se prepara cancela la captura.

## Límites conocidos

- La vista de celular usa emulación de Chrome DevTools Protocol con marco de dispositivo, densidad, User-Agent y entrada táctil. No ejecuta Safari ni un teléfono físico.
- Las dimensiones del perfil corresponden a la pantalla del dispositivo en píxeles CSS. La barra de estado y el gesto inferior ocupan parte de esa pantalla; el viewport de la página descuenta esas franjas y se informa por separado. Por ejemplo, el iPhone 14 Pro tiene pantalla de 393 × 852 y página web de 393 × 759 CSS px. La captura visible sale a 786 × 1518 px sin marco o 874 × 1781 px con él. La carcasa conserva su proporción: no se alarga para agregar las barras. No se emulan las barras dinámicas de Safari o Chrome móvil.
- Al entrar al simulador se carga una instancia nueva del sitio; los cambios que solo estaban en la memoria de la página original no se transfieren automáticamente. Los cambios dentro del celular se conservan al rotar o elegir otro modelo. Al cerrar se recupera el documento original. Los sitios que dependen de cookies de terceros, ventanas externas o del contexto de la ventana principal pueden requerir usar la página original.
- Los paneles con desplazamiento interno y los iframes incluidos en el sitio conservan su parte visible y generan una advertencia. No hay selector ni captura independiente de esos contenidos.
- La conversión de mouse a gestos táctiles se aplica al documento principal dentro del teléfono. Los widgets en iframes internos mantienen su interacción propia con mouse.
- Las listas virtualizadas, videos y contenido que cambia durante la operación pueden producir un resultado diferente de lo visto antes de capturar. La detección de listas virtualizadas es orientativa.
- El recorrido intenta activar la carga diferida; no garantiza esperar recursos que aparecen mucho después o requieren una acción del usuario.
- El acceso temporal cubre el origen autorizado. Si la navegación del celular pasa a otro sitio, puede ser necesario abrir ese sitio como página principal e invocar nuevamente Encuadre.
- Si se interrumpe la extensión, un temporizador retira los estilos de preparación y restaura el desplazamiento tras 45 segundos sin actividad de captura. Si la pestaña navega o se cierra, el documento anterior deja de existir.
- La ampliación «Ajustar» se recalcula al redimensionar la ventana.
- Las superficies protegidas o no compatibles muestran un error. No se admiten páginas internas de Chrome, su tienda de extensiones ni archivos locales en esta P0.
- El PDF contiene imágenes, sin texto seleccionable. Permite hojas A4 verticales u horizontales con márgenes, o una sola página larga. La paginación hace cortes continuos de la imagen; no reconoce párrafos ni evita cortar un elemento entre dos hojas. La comparación y la grabación siguen pendientes.

## Desarrollo y verificación

```powershell
npm run dev
npm run typecheck
npm test
npm run test:all
npm run test:popup
npm run test:action
npm run test:quality
npm run test:inline
npm run test:p1
npx playwright install chromium
npm run build
npm run test:e2e
```

Las pruebas de integración cargan la extensión en Chromium con un perfil temporal y un sitio local. Verifican la captura nativa visible y completa, los píxeles del pie, el encabezado fijo sin repetir, la restauración, PNG/JPEG, tamaños propios, cancelación, páginas infinitas, límites de imagen y recuperación ante el cierre de la pestaña. Las copias de prueba conceden acceso a los hosts porque abrir una página de extensión mediante automatización no equivale al gesto del usuario que concede `activeTab`; el manifiesto de producción conserva el acceso temporal para el flujo habitual. `test:p1` verifica que el inicio no conecte al depurador, que abrir la vista de celular active la emulación y que cerrarla la desconecte. Los artefactos quedan en `test-results/`.

`test:popup` abre la acción nativa de Chrome mediante `chrome.action.openPopup()` y examina ese contexto real por CDP. Verifica que no se quede en el tamaño inicial de 300 × 150 y que los controles principales entren sin recortes ni scroll. Abrir `index.html` en una pestaña y fijarle un viewport no sustituye esta comprobación.

`test:quality` verifica píxeles nítidos a 2× y 3×, el resultado con progreso abierto antes de capturar, la conservación del formulario y el desplazamiento, la captura completa hasta el pie y las capturas horizontales más anchas que el navegador. También comprueba la cancelación desde el resultado y al cerrar su pestaña.

`npm run test:all` compila y ejecuta los tests unitarios y todas las pruebas de navegador, incluyendo P1, editor y PDF. Las pruebas del editor y PDF usan un servidor temporal que el ejecutor cierra al terminar; si ya hay un servidor de Encuadre abierto, `TEST_ORIGIN` permite reutilizarlo. `npm run test:pdf` comprueba las opciones de A4, los márgenes, la orientación, su persistencia y la página larga desde el visor.

`test:inline` comprueba que abrir el marco no crea pestañas, conserva la dirección original y permite interactuar con el documento móvil ante respuestas comprimidas y restricciones de incrustación. Verifica colores del PNG, captura a 2× incluso cuando excede el ancho físico de la ventana, modelos, rotación, preservación del formulario, captura completa, cancelación, restauración y eliminación de las reglas temporales.

Código principal: `src/background.ts` coordina Chrome, captura y vista en vivo; `src/lib/page.ts` contiene las operaciones ejecutadas en un mundo aislado de la página; `src/main.tsx`, `src/simulator.tsx` y `src/result.tsx` implementan el popup, el simulador y el visor; `src/lib/device-viewport.ts` calcula el área web; `src/lib/device-frame.ts` compone las imágenes y los indicadores del sistema. Los componentes de shadcn viven en `src/components/ui/`.

Referencias técnicas: [Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs), [Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting), [Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest), [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) y [shadcn/ui](https://ui.shadcn.com/docs). La referencia de comportamiento y las medidas CSS de los perfiles se consultaron en [Mobile FIRST](https://www.webmobilefirst.com/en/) y su [catálogo de dispositivos](https://www.webmobilefirst.com/en/devices/). Los créditos de las imágenes se detallan en [FRAME-CREDITS.md](./FRAME-CREDITS.md).

## Editor, ocultado y emulador — P1

- En el resultado, **Editar captura** abre Recortar, Flecha, Rectángulo, Texto, Resaltar y Ocultar, con Deshacer y Rehacer. Se puede dibujar arrastrando o con flechas y Enter. Escape cancela el trazo y Ctrl/⌘ Z deshace; Shift agrega rehacer.
- **Ocultar** reemplaza el área por negro opaco. Las máscaras se aplican después de las anotaciones y se exportan como píxeles aplanados en PNG, JPG, PDF, impresión y copia. El archivo no incorpora la imagen original ni el historial. El original temporal sigue disponible en la sesión para deshacer; recargar la pestaña pierde las ediciones. Las ediciones se exportan sin marco. Si una edición falla, se bloquea la exportación hasta que haya una revisión válida.
- **Abrir emulador de celular** ofrece un único flujo, similar al modo de dispositivos de DevTools, con el teléfono y sus controles dentro de la página. Chrome aplica densidad real, identificación móvil y entrada táctil al sitio. Los clics y arrastres del mouse dentro del teléfono se traducen a eventos táctiles de Chrome; los controles de la extensión conservan su interacción normal.
- Los enlaces y formularios del mismo sitio se abren dentro del teléfono al hacer clic, incluso si apuntan a la pestaña completa, al contenedor o a una ventana nueva. La navegación entre rutas conserva abierto el emulador y respeta los manejadores de clic del sitio.
- **Opciones del dispositivo**, dentro del emulador, permite elegir densidad de 1×, 2× o 3×, User-Agent personalizado y entrada táctil. Un User-Agent vacío elige una identificación móvil según el dispositivo. Aplicar opciones, rotar y cambiar de modelo conservan el documento móvil. **Recargar página del celular** permite repetir la solicitud con la identificación elegida; puede perder formularios sin guardar.
- La ampliación se controla dentro del emulador. Mientras está abierto, el zoom nativo de Chrome se mantiene al 100 % para conservar las medidas CSS y la densidad; al cerrar se restaura el zoom que tenías o el último que intentaste aplicar.
- Chrome exige el permiso `debugger` al instalar y muestra un aviso de depuración mientras la vista está abierta. Cerrar la vista o volver a escritorio desconecta el depurador y restaura la página original. Si Chrome o DevTools desconectan la sesión durante una captura, se informa la interrupción.

`npm run test:p1` comprueba las herramientas del editor, los píxeles opacos exportados, JPG/PDF, la densidad y el User-Agent del sitio dentro del marco, los eventos táctiles reales desde el mouse, la rotación, la conservación de formularios y la restauración al cerrar.
