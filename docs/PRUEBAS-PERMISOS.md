# Prueba con los permisos de producción

```powershell
npm run build
npm run test:permissions
```

La prueba carga `dist/` sin modificar el manifiesto, agregar permisos de sitios ni simular las APIs de Chrome. Usa un perfil temporal de Chromium y una página local; cierra el navegador y elimina ese perfil al terminar. También se ejecuta dentro de `test:e2e` y `test:all`.

Comprueba:

- La extensión no puede ejecutar código en el sitio antes de invocar su acción.
- Activar el ícono abre el popup nativo y concede el acceso temporal.
- La captura completa de escritorio se genera desde ese popup.
- Navegar a otra ruta del mismo origen conserva el acceso.
- El simulador abre una página con restricciones de incrustación, permite navegar y genera una captura visible.
- Volver a escritorio conserva el formulario original, elimina las reglas temporales y desconecta el depurador de la extensión.
- Cambiar de origen retira el acceso; volver a invocar el ícono lo concede al nuevo sitio.

La activación se automatiza con [`Extensions.triggerAction`](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-triggerAction). Requiere una versión de Chromium que incluya esa operación; se verificó con Chromium 156 de Playwright. El argumento `--enable-unsafe-extension-debugging` se aplica únicamente al navegador temporal de pruebas y habilita esa automatización; no modifica los permisos de la extensión distribuida. Si la operación no está disponible, la prueba falla explícitamente.

Esta suite complementa las pruebas de funciones y calidad de imagen que usan una copia del manifiesto con acceso ampliado. No verifica sesiones de terceros, todos los sitios de Internet ni el menú contextual y el atajo como mecanismos de concesión de acceso.
