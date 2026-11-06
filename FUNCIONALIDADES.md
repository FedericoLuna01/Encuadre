# Extensión de captura completa y simulación de dispositivos

Fecha de investigación: 3 de noviembre de 2026.

## 1. Objetivo

Crear una extensión para Chrome de escritorio que combine dos capacidades: **probar una web con distintos tamaños de pantalla y capturar la página completa con el tamaño elegido**. El usuario debe poder pasar de revisar una versión móvil a descargar una imagen larga sin cambiar de herramienta.

Este documento reúne funciones declaradas por los productos de referencia y propone un alcance propio. La investigación se basa en sus fichas y sitios oficiales; no incluye pruebas de las extensiones instaladas. Las funciones propuestas son requisitos para nuestro producto, no afirmaciones de que ya estén implementadas.

### Uso personal y acceso a las funciones

Por el momento, la extensión será para uso personal. Todas las funciones que se implementen estarán disponibles gratis, sin planes, suscripciones, pruebas temporales, cuentas ni bloqueos de funciones. Esto incluye las herramientas de edición y exportación que las extensiones de referencia ofrecen como Premium o PRO.

Las prioridades P0, P1 y P2 de este documento indican etapas de desarrollo, no niveles de pago. Las menciones a planes comerciales describen únicamente los productos investigados.

## 2. Qué ofrece cada referencia

### GoFullPage

Según su [ficha oficial en Chrome Web Store](https://chromewebstore.google.com/detail/gofullpage-full-page-scre/fdpohaocaechififmbbbbbknoalclacl):

- Captura completa mediante desplazamiento y unión de imágenes, iniciada desde el ícono o un atajo.
- Tratamiento de páginas complejas, incluidos elementos con desplazamiento interno e iframes.
- Vista del resultado en otra pestaña.
- Exportación a PNG, JPEG y PDF con tamaños de papel configurables.
- División en varias imágenes cuando la página excede el tamaño admitido.
- Copia al portapapeles y opciones de descarga automática y nombres con fecha, documentadas también en su historial.

Su [comparación de planes](https://gofullpage.com/premium) distingue la captura gratuita del editor Premium: recorte, anotaciones, desenfoque, texto, resaltado, URL y fecha, y división inteligente del PDF. La [FAQ oficial](https://gofullpage.com/faq) confirma que descargar capturas sin editar como imagen o PDF no requiere Premium.

En nuestra extensión, estas funciones estarán disponibles gratis a medida que se implementen.

### Mobile simulator / Mobile FIRST

Según su [ficha oficial en Chrome Web Store](https://chromewebstore.google.com/detail/mobile-simulator-responsi/ckejmhbmlajgoklhgbapkiccekfoccmk):

- Perfiles de teléfonos, tablets y otros dispositivos; también tamaños personalizados guardados.
- Cambio entre orientación vertical y horizontal.
- Simulación de desplazamiento táctil y zoom.
- Comparación de varios dispositivos en paralelo.
- Marcos de dispositivos y capturas PNG con transparencia.
- Grabación y exportación de demos en MP4, WebM y GIF.
- Opciones como modo PWA, pantalla completa, teclado y tema oscuro.
- Funciones gratuitas y otras sujetas a planes PRO; la ficha no detalla la asignación completa por plan.
- Un servicio adicional, **Live device**, para controlar dispositivos iOS y Android alojados en la nube.

Su [sitio oficial](https://www.webmobilefirst.com/en/) agrega navegación compartida entre vistas, captura conjunta de la comparación y perfiles con viewport, densidad de píxeles y User-Agent. Al consultar, el sitio anuncia 89 dispositivos y la tienda utiliza “80+”; conviene tratar el catálogo como variable.

**Distinción fundamental:** el simulador local reproduce condiciones dentro de Chrome. Live device es un servicio separado; una vista con marco de iPhone no implica ejecutar Safari.

## 3. Propuesta de producto

La función central será **“Capturar página completa en este dispositivo”**. Debe producir una imagen del contenido con el ancho seleccionado y la altura total de la página, aunque ese contenido no entre en una sola pantalla.

Habrá tres resultados diferentes:

| Resultado | Contenido | Uso |
| --- | --- | --- |
| Pantalla visible | Solo lo que entra en el viewport | Registrar un estado puntual |
| Página completa | Todo el contenido vertical al ancho elegido | Revisar y compartir una web completa |
| Presentación con dispositivo | Pantalla visible dentro de un marco opcional | Mostrar una propuesta o demo |

Una página larga no debe deformarse para entrar en el marco de un teléfono. El marco se aplica a la captura visible; la captura completa se exporta como una tira de contenido.

## 4. Funcionalidades de la primera versión — P0

### 4.1. Activación y controles

- Abrir un popup nativo de Chrome desde el ícono de la extensión; los controles no usan el panel lateral.
- Ofrecer “Vista de escritorio”, “Elegir dispositivo”, “Capturar pantalla” y “Capturar página completa”.
- Permitir configurar un atajo para capturar, sujeto a los atajos disponibles del navegador.
- Recordar el último perfil y las preferencias de exportación.
- Mostrar preparación, progreso, resultado, cancelación y errores con mensajes claros.

### 4.2. Vista adaptable

- Incluir un catálogo inicial reducido de modelos concretos de teléfonos, tablet y escritorio, con sus medidas visibles.
- Abrir una vista interactiva con el marco del modelo seleccionado y barra de estado (hora, señal, Wi-Fi y batería), cámara y gesto inferior o botón de inicio según corresponda. Los elementos del sistema son ilustrativos; el contenido sigue ejecutándose en Chrome.
- Permitir definir y guardar ancho y alto personalizados en píxeles CSS.
- Rotar intercambiando ancho y alto.
- Permitir navegar, abrir menús, completar formularios y desplazarse antes de capturar.
- Ajustar visualmente la previsualización al espacio disponible sin cambiar el ancho CSS que determina el diseño.
- Mostrar por separado el tamaño de la página y el porcentaje de ampliación de la previsualización.
- Volver a escritorio y retirar los cambios temporales de simulación.

**Alcance inicial:** probar distribución y puntos de adaptación. La emulación de densidad, User-Agent y entrada táctil queda para una etapa posterior y debe identificarse como tal en la interfaz.

### 4.3. Captura de escritorio y del tamaño seleccionado

- Capturar tanto el área visible como la página completa.
- Capturar el contenido renderizado con el ancho elegido, sin incluir los controles de la extensión.
- Mantener la proporción del contenido y mostrar las dimensiones reales de la imagen resultante.
- Esperar fuentes e imágenes disponibles, con un tiempo máximo para no bloquear la operación indefinidamente.
- Intentar activar contenido de carga diferida durante el recorrido.
- Tratar encabezados y elementos fijos para evitar repeticiones en cada unión; restaurarlos al terminar.
- Permitir cancelar y restaurar la posición de desplazamiento y los cambios temporales, también ante errores.
- Detener páginas de desplazamiento infinito por un límite de tiempo o altura y avisar si el resultado es parcial.
- Dividir el resultado o reducir su escala con aviso si excede límites de memoria o dimensiones.
- Informar si una página o parte de ella no se pudo capturar, sin presentar el resultado como completo.

La primera versión debe cubrir páginas con desplazamiento principal. Capturar el contenido completo de paneles internos e iframes complejos es un objetivo posterior; inicialmente se conserva lo que esté renderizado dentro de ellos y se informa la limitación cuando se detecte.

### 4.4. Resultado y descarga

- Abrir una vista del resultado con zoom y ajuste al ancho.
- Descargar en PNG o JPEG; permitir elegir la calidad del JPEG.
- Copiar la imagen al portapapeles cuando esté disponible y ofrecer descarga si falla.
- Generar nombres con sitio, perfil, orientación y fecha, evitando caracteres inválidos.
- Mostrar dimensiones, perfil utilizado y advertencias de captura parcial.
- En las capturas visibles de teléfonos y tablets, permitir elegir una presentación con carcasa de imagen del modelo y barra de estado o descargar solo la página. Las barras se incluyen dentro de la pantalla del equipo, se informa el área web disponible y la carcasa conserva sus proporciones. La imagen final tiene fondo exterior transparente en PNG y se exporta a 2×. La captura completa sigue siendo una tira vertical sin marco.
- Permitir repetir la captura y regresar a la página de origen.

### 4.5. Privacidad y compatibilidad

- Procesar las capturas localmente, sin cuenta ni carga a servidores para el flujo principal.
- Pedir permisos relacionados con las funciones habilitadas y explicar su propósito.
- No guardar automáticamente un historial de capturas sensibles.
- Soportar páginas HTTP y HTTPS y desarrollo en `localhost`, sujeto a permisos y restricciones del navegador.
- Distinguir falta de permiso, página restringida, pérdida de la pestaña y agotamiento de recursos.
- Tener controles utilizables con teclado y textos iniciales en español.

## 5. Ampliaciones — P1

| Área | Funciones |
| --- | --- |
| Editor | Recorte, flechas, rectángulos, texto, resaltado, deshacer y rehacer |
| Ocultar información | Cubrir con un bloque opaco antes de exportar; generar un archivo final sin capas recuperables |
| PDF | Tamaño de papel, orientación, márgenes y paginación; aclarar que se exportan imágenes, sin prometer texto seleccionable |
| Presentación | Ampliar los marcos básicos anticipados a P0 con fondo de color, márgenes y sombra configurables |
| Metadatos | Título, URL y fecha opcionales; revisar parámetros de URL antes de incluirlos |
| Perfiles avanzados | Densidad de píxeles, User-Agent y entrada táctil, según la técnica validada |
| Captura compleja | Fuera del alcance actual; se mantiene la captura general y el tratamiento de elementos fijos y sticky |
| Biblioteca local | Guardado explícito, miniaturas, búsqueda, límites de almacenamiento y eliminación por el usuario |

### Estado de implementación — 6 de noviembre de 2026

- **Editor y ocultado: implementados.** Recorte, flechas, rectángulos, texto, resaltado, deshacer/rehacer y bloques negros opacos. La exportación se aplana en píxeles, sin capas ni la imagen original dentro del archivo. Las ediciones duran durante la sesión del visor y se exportan sin marco.
- **Perfiles avanzados: implementados.** Densidad de 1× a 3×, User-Agent y entrada táctil reales, integrados directamente en la vista de celular con marco, sin un modo avanzado separado. Chrome exige el permiso `debugger` al instalar y muestra su aviso durante la emulación. La identificación móvil se aplica al abrir el sitio del teléfono. Recargarlo después de cambiar opciones es opcional y se advierte sobre la pérdida de estado.
- **Captura compleja: fuera del alcance actual por decisión del usuario.** Se retiró la selección y captura independiente de paneles e iframes. Se mantiene el tratamiento de elementos fijos y sticky en la captura general.
- **PDF: implementado para A4 y página larga.** Hojas A4 verticales u horizontales, márgenes de 0 a 30 mm y paginación continua; también conserva la alternativa de una sola página larga. Las opciones se guardan y la impresión usa la orientación y los márgenes elegidos. Se exportan imágenes sin texto seleccionable ni cortes inteligentes por párrafo. Otros tamaños de papel siguen fuera del alcance actual.
- Presentación configurable, metadatos opcionales y biblioteca local siguen pendientes.

La transparencia del marco o del fondo exterior no implica eliminar automáticamente el fondo de la página capturada.

## 6. Ampliaciones — P2

- **Comparación en paralelo:** mostrar dos o más tamaños con identificación clara de cada perfil.
- **Desplazamiento sincronizado opcional:** vincular posiciones relativas sin asumir que todos los diseños tienen la misma altura.
- **Captura por lote de dispositivos:** recorrer perfiles seleccionados y descargar un archivo por perfil o un ZIP. El usuario debe saber si cada vista conserva el estado actual o requiere recargar.
- **Lámina comparativa:** reunir capturas de varios dispositivos en una imagen con etiquetas.
- **Grabación de demos:** iniciar y detener grabación, con indicador visible. Validar formatos disponibles antes de ofrecer MP4 o GIF; pueden requerir conversión adicional.
- **Opciones de presentación:** tema oscuro de los controles y vistas de apariencia PWA, sin prometer instalar o ejecutar una PWA real.

**Propuesta adicional:** guardar una “receta de captura” con URL, perfiles y opciones, sin almacenar contraseñas ni estado privado. Permitiría repetir revisiones con menos pasos; cuesta agregar persistencia y no garantiza reproducir contenido dinámico. Es una ampliación opcional, fuera del alcance inicial.

## 7. Flujo principal esperado

1. El usuario abre la página y activa la extensión.
2. Elige escritorio, un dispositivo o un tamaño personalizado.
3. Revisa la página y la deja en el estado que quiere registrar.
4. Selecciona “Capturar página completa”.
5. La extensión muestra el avance y permite cancelar.
6. Se abre la imagen con las medidas y cualquier advertencia.
7. El usuario descarga PNG/JPEG o copia el resultado.

Ejemplo: revisar un menú desplegado con un ancho de 390 píxeles CSS y exportar la página completa a ese ancho. Si la preparación exige recargar o pierde ese estado, la extensión debe avisar antes de hacerlo.

## 8. Límites y decisiones técnicas que afectan las funciones

Estas son consideraciones de viabilidad, no una arquitectura cerrada.

- **Simulación aproximada:** Chrome documenta que su modo de dispositivos no ejecuta el código en un móvil real. Por eso no se debe prometer fidelidad total de Safari, teclado del sistema o rendimiento físico. Véase [Device Mode](https://developer.chrome.com/docs/devtools/device-mode).
- **Captura por segmentos:** `captureVisibleTab` captura el área visible y tiene un máximo documentado de dos llamadas por segundo. Si se usa para unir segmentos, habrá que coordinar pestaña activa, desplazamiento y esperas. Véase [API de pestañas](https://developer.chrome.com/docs/extensions/reference/api/tabs).
- **Captura habitual sin aviso de depuración:** la implementación utiliza `captureVisibleTab`, `scripting` y reglas temporales de `declarativeNetRequestWithHostAccess`. Las capturas de escritorio no se conectan a `chrome.debugger`; abrir la vista de celular activa la emulación y su aviso del navegador. El viewport móvil pertenece al iframe y la captura se compone localmente a partir de segmentos.
- **No alcanza con achicar visualmente la página:** reducirla con una transformación visual no asegura que se activen los puntos de adaptación. El prototipo debe comprobar el ancho CSS efectivo del documento.
- **Páginas embebidas:** antes de basar la solución en iframes, validar restricciones de inserción y diferencias de sesión/navegación. Si una web no admite ese enfoque, se necesita otra modalidad o un mensaje de incompatibilidad.
- **Contenido cambiante:** feeds virtualizados, videos, animaciones y datos en tiempo real pueden producir uniones inconsistentes. No se garantiza una captura de todo el contenido histórico que una página podría cargar.
- **Acceso restringido:** poder obtener una imagen visible no implica poder inyectar código y recorrer toda la página. Debe verificarse la capacidad de captura completa por tipo de URL.

Antes de cerrar la implementación, validar con un prototipo: ancho efectivo, comportamiento de `meta viewport`, preservación de sesión y formularios, escala de salida y funcionamiento en webs que rechazan ser embebidas.

## 9. Criterios de aceptación del alcance inicial

- En una página de prueba estática larga, la captura incluye desde el inicio hasta el final, sin franjas faltantes ni contenido duplicado en las uniones.
- Elegir dos anchos a ambos lados de un breakpoint cambia efectivamente el diseño y ese cambio aparece en la captura.
- Rotar aplica las dimensiones invertidas; ampliar la previsualización no altera el breakpoint.
- La imagen completa conserva el ancho de salida informado y no incorpora controles ni marcos de la extensión.
- Un encabezado fijo de prueba no se repite en cada segmento.
- Cancelar o provocar un error restaura desplazamiento y modificaciones temporales.
- Una página infinita termina por límite y el resultado se identifica como parcial.
- PNG y JPEG descargados se abren correctamente y sus dimensiones coinciden con las informadas.
- Una página no compatible muestra una explicación y no deja la interfaz bloqueada.
- El flujo principal funciona sin cuenta ni envío de la captura a servidores.

## 10. Alcance recomendado

Construir primero **simulación por tamaño + captura completa en ese tamaño + exportación local PNG/JPEG**. Ese recorrido entrega el valor principal de combinar ambas referencias.

El editor, PDF, opciones avanzadas de presentación, comparación y grabación amplían el producto por etapas. Los dispositivos reales en la nube quedan fuera del plan inicial: requieren infraestructura, sesiones remotas y costos operativos propios. Tampoco se plantea copiar marcas, interfaz o recursos gráficos de las extensiones investigadas.
