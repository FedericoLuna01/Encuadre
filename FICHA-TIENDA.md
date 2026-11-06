# Ficha de Encuadre

## Nombre

- Español: **Encuadre — Capturas de página completa**
- Inglés: **Encuadre — Full Page Screenshots**

## Descripción breve

Capturá páginas completas o su parte visible, probá tamaños de celular y exportá en PNG, JPEG o PDF. Sin cuenta.

En inglés: Capture full pages or the visible area, try phone screen sizes, and export as PNG, JPEG, or PDF. No account needed.

El nombre y la descripción breve se incluyen en `public/_locales/es/messages.json` y `public/_locales/en/messages.json`. La descripción completa se carga por idioma en la tienda; no se traduce desde el manifiesto. La interfaz interna está disponible en español e inglés; se adapta al idioma de Chrome y usa inglés como respaldo para otros idiomas.

## Descripción completa

Probá cómo se ve una página en distintos tamaños y guardá una captura lista para compartir.

Con Encuadre podés:

- Capturar una página completa o solo la parte visible.
- Abrir una vista de celular en la misma pestaña, elegir un modelo y cambiar su orientación.
- Guardar capturas visibles de celulares con marco o solo con el contenido de la página.
- Exportar en PNG, JPEG o PDF, o copiar la imagen al portapapeles.
- Recortar, agregar flechas, rectángulos, texto y resaltados, y ocultar información con bloques negros opacos.
- Usar la vista de celular con emulación de densidad, User-Agent y entrada táctil, conservando el marco; Chrome muestra un aviso de depuración mientras está abierta.
- Guardar tus tamaños preferidos y repetir una captura.
- Acceder desde el ícono, el menú del botón derecho o el atajo Alt+Shift+S.

El procesamiento se realiza en tu navegador. No necesitás crear una cuenta y las capturas no se envían a un servidor.

La vista de celular permite revisar la distribución de una página en Chrome; no reproduce Safari ni todas las características de un teléfono real. Algunas páginas protegidas, listas virtualizadas o contenidos con desplazamiento interno pueden tener limitaciones. Las páginas internas del navegador y la tienda de extensiones no admiten capturas.

## Propósito único

Revisar la presentación de páginas web en distintos tamaños y generar capturas exportables de esas vistas.

## Recursos del proyecto

- Íconos PNG de 16, 32, 48 y 128 píxeles en `public/icons/`, junto con su fuente SVG editable.
- Política de privacidad en [PRIVACIDAD.md](./PRIVACIDAD.md), con los usos de los permisos.
- Extensión compilada en `dist/` después de ejecutar `npm run build`.

## Pendiente para publicar

La instalación local está preparada. La publicación requiere completar la cuenta de desarrollador, el contacto real y las declaraciones de privacidad de la tienda; alojar la política de privacidad; preparar capturas y los recursos promocionales que solicite el formulario vigente; y revisar las condiciones de redistribución de los marcos en [FRAME-CREDITS.md](./FRAME-CREDITS.md). El ícono propio no utiliza recursos de terceros.

Para armar el ZIP de carga en Windows, ejecutá después de compilar:

```powershell
Compress-Archive -Path .\dist\* -DestinationPath .\encuadre-0.1.0.zip
```

El manifiesto debe quedar en la raíz del ZIP. No incluyas `node_modules`, pruebas ni código fuente. Actualizá la versión en `package.json` para cada nueva entrega; el manifiesto la toma de ahí.
