# Privacidad de Encuadre

Encuadre permite probar tamaños de página y crear capturas desde Chrome. No requiere una cuenta ni incorpora analítica, publicidad o servicios externos de procesamiento.

## Qué se procesa

Al invocar la extensión, Encuadre accede temporalmente al sitio autorizado para leer sus dimensiones y colores, mostrar la vista de celular y capturar el contenido. Las imágenes pueden incluir cualquier información visible en esa página. El procesamiento y la exportación a PNG, JPEG o PDF se realizan en el navegador; Encuadre no envía las capturas a un servidor.

Las ediciones viven en la memoria de la pestaña de resultado hasta que la cerrás o recargás. Ocultar información genera archivos aplanados con bloques negros opacos; el original temporal sigue disponible para deshacer dentro de la sesión del editor.

La vista de celular carga el sitio que elegiste dentro de una nueva instancia de la página. Ese sitio sigue haciendo sus propias solicitudes de red y aplicando sus políticas de privacidad.

## Qué se guarda

- Las preferencias de tamaño, formato y presentación se guardan localmente en Chrome.
- El estado de trabajo y la referencia de la pestaña se conservan durante la sesión del navegador.
- El resultado actual, incluidos su imagen y los metadatos necesarios para mostrarlo, se guarda temporalmente en IndexedDB. Una nueva captura lo reemplaza. Se elimina al cerrar su pestaña de resultado o al reiniciar Chrome. Si Chrome o la extensión se interrumpen, la limpieza puede quedar pendiente hasta su próxima inicialización.
- Las imágenes y los documentos que descargás, y las imágenes que copiás al portapapeles, permanecen bajo tu control y el del sistema operativo. La extensión no los elimina.

Encuadre no mantiene una biblioteca ni un historial de capturas. Podés eliminar sus preferencias y datos locales desinstalando la extensión.

## Para qué se usan los permisos

- `debugger`: aplicar densidad de píxeles, User-Agent y entrada táctil cuando abrís el emulador de celular con marco. Chrome exige declararlo al instalar y muestra un aviso mientras la emulación está conectada. Cerrar el emulador desconecta el depurador; capturar escritorio no lo conecta. No se guardan registros de red.
- `activeTab`: acceder temporalmente a la página cuando invocás la extensión.
- `tabs`: consultar la dirección de las pestañas para habilitar el ícono en sitios compatibles y deshabilitarlo en páginas restringidas. Estas consultas no se guardan como historial ni se envían a un servidor.
- `scripting`: preparar la página para la captura y restaurar sus estilos y desplazamiento.
- `declarativeNetRequestWithHostAccess`: permitir que el sitio autorizado se muestre dentro de la vista de celular. Modifica temporalmente encabezados de incrustación de subframes de ese origen en esa pestaña. La regla se retira al cerrar la vista, cambiar de página o cerrar la pestaña.
- `storage`: recordar preferencias y estado de sesión.
- `clipboardWrite`: copiar la captura cuando lo solicitás.
- `contextMenus`: ofrecer las acciones de Encuadre en el menú del botón derecho.

## Antes de publicar

Este texto describe la implementación actual. El responsable de la publicación debe agregar su identidad y un medio de contacto real, y alojar la versión final en una dirección pública para la ficha de la tienda.
