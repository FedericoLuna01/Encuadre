# Recursos de los marcos

Las imágenes se incluyen localmente para componer capturas y previsualizaciones. No se envían capturas a los proveedores y no se ofrece descargar los marcos vacíos como un producto independiente.

- **iPhone 14 Pro (Deep Purple) e iPhone 15 Pro (Blue Titanium):** [WithFrame](https://withfra.me/shot). Recursos originales: `https://shot.withfra.me/frames/iphone.14.pro/deep_purple`, `https://shot.withfra.me/frames/iphone.15.pro/blue`. Las [condiciones de los marcos](https://withfra.me/shot/iphone-14-pro) permiten su uso personal y comercial y excluyen su redistribución o venta como archivos independientes. La licencia de los componentes React Native de WithFrame es un producto distinto: no se incorporó ninguno de esos componentes.
- **iPhone 13, iPhone 15, iPhone 15 Pro Max, iPhone 16, Pixel 8 e iPad Air:** colección [device-frames-media de Jonny Jackson](https://github.com/jonnyjackson26/device-frames-media), basada en imágenes de los dispositivos y recursos de diseño de sus fabricantes. Consultar también los [créditos de la colección de James Jingyi](https://github.com/jamesjingyi/mockup-device-frames), de la que proceden varias de estas imágenes. Colores usados: Midnight, Pink, Black Titanium, Black, Hazel y Space Grey, respectivamente. No se atribuye una licencia MIT a estas imágenes.
- **Samsung Galaxy S24 y S24 Ultra:** versiones estándar gratuitas de [Mobile FIRST — S24](https://www.webmobilefirst.com/en/mockups/samsung-galaxy-s24-2024/) y [S24 Ultra](https://www.webmobilefirst.com/en/mockups/samsung-galaxy-s24-ultra-2024/). Sus condiciones permiten uso personal y comercial y modificación; excluyen la venta o redistribución del archivo solo. Se usan las versiones estándar, sin acceder a las versiones HD pagas.

Las marcas, modelos e imágenes de los productos pertenecen a sus respectivos titulares. Su inclusión no expresa afiliación con ellos.

`scripts/prepare-frames.mjs` recorta el margen exterior transparente, calcula la máscara del área de pantalla mediante su canal alfa y genera las variantes horizontales. No modifica ni reconstruye la carcasa. El resultado y sus coordenadas se guardan en `public/frames` y `src/lib/frame-assets.json`. El empaquetado no requiere red ni ejecutar este script nuevamente.

## Catálogo ampliado de iPhone

Se incorporan más modelos y colores de [Fastlane / frameit-frames](https://github.com/fastlane/frameit-frames) y [Monkr](https://github.com/blaineam/Monkr), que reúnen recursos de Apple y de sus fabricantes. El SE usa ahora el frontal de la 2.ª generación, en negro, blanco o rojo. No se atribuye una licencia de código abierto a las imágenes de Apple. El [catálogo y sus faltantes](./IPHONE-MOCKUPS.md) detalla la cobertura. Las URLs exactas están en `scripts/iphone-frame-sources.json`, fijadas a revisiones concretas. Los colores originales de las carcasas no se alteran.
