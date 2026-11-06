# Mockups de iPhone

34 modelos y 144 combinaciones de modelo y color verificadas, del iPhone X en adelante. Incluye el SE de 2.ª generación (2020). Cada variante tiene marco y máscara de pantalla en vertical y horizontal. El iPhone 15 conserva **rosa** como opción inicial.

| Modelo | Colores disponibles |
| --- | --- |
| iPhone 11 | Negro, Verde, Morado, Rojo, Blanco, Amarillo |
| iPhone 11 Pro | Dorado, Verde noche, Plata, Gris espacial |
| iPhone 11 Pro Max | Dorado, Verde noche, Plata, Gris espacial |
| iPhone 12 | Negro, Azul, Verde, Rojo, Blanco |
| iPhone 12 mini | Negro, Azul, Verde, Rojo, Blanco |
| iPhone 12 Pro | Dorado, Grafito, Azul pacífico, Plata |
| iPhone 12 Pro Max | Dorado, Grafito, Azul pacífico, Plata |
| iPhone 13 | Azul, Medianoche, Rosa, Rojo, Blanco estrella |
| iPhone 13 mini | Azul, Medianoche, Rosa, Rojo, Blanco estrella |
| iPhone 13 Pro | Dorado, Grafito, Azul sierra, Plata |
| iPhone 13 Pro Max | Dorado, Grafito, Azul sierra, Plata |
| iPhone 14 | Azul, Medianoche, Morado, Rojo, Blanco estrella |
| iPhone 14 Plus | Azul, Medianoche, Morado, Rojo, Blanco estrella |
| iPhone 14 Pro | Negro espacial, Dorado, Morado oscuro, Plata |
| iPhone 14 Pro Max | Negro espacial, Dorado, Morado oscuro, Plata |
| iPhone 15 | Negro, Azul, Verde, Rosa, Amarillo |
| iPhone 15 Plus | Negro, Azul, Verde, Rosa, Amarillo |
| iPhone 15 Pro | Titanio negro, Titanio azul, Titanio natural, Titanio blanco |
| iPhone 15 Pro Max | Titanio negro, Titanio azul, Titanio natural, Titanio blanco |
| iPhone 16 | Negro, Rosa, Verde azulado, Azul ultramar, Blanco |
| iPhone 16 Plus | Negro, Rosa, Verde azulado, Azul ultramar, Blanco |
| iPhone 16 Pro | Titanio negro, Titanio desierto, Titanio natural, Titanio blanco |
| iPhone 16 Pro Max | Titanio negro, Titanio desierto, Titanio natural, Titanio blanco |
| iPhone 17 | Negro, Lavanda, Azul neblina, Verde salvia, Blanco |
| iPhone 17 Pro | Naranja cósmico, Azul profundo, Plata |
| iPhone 17 Pro Max | Naranja cósmico, Azul profundo, Plata |
| iPhone 18 Pro | Negro, Bordó, Glaciar, Plata |
| iPhone 18 Pro Max | Negro, Bordó, Glaciar, Plata |
| iPhone Air | Blanco nube, Dorado claro, Azul cielo, Negro espacial |
| iPhone SE (2.ª generación) | Negro, Rojo, Blanco |
| iPhone X | Plata, Gris espacial |
| iPhone XR | Azul, Coral, Rojo, Blanco, Negro, Amarillo |
| iPhone XS | Dorado, Plata, Gris espacial |
| iPhone XS Max | Dorado, Plata, Gris espacial |

## Cobertura pendiente

No se consiguieron marcos fotográficos frontales verificables y listos para integrar del SE de 3.ª generación, 16e y 17e. El Duo requiere además definir cómo representar sus distintas pantallas. Los modelos anteriores al X quedan fuera del alcance solicitado.

Faltan algunos acabados: morado del 12 y 12 mini, verde del 13 y 13 mini, verde alpino del 13 Pro y Pro Max, y amarillo del 14 y 14 Plus. El selector ofrece los archivos encontrados, sin recolorear otros acabados.

## Fuentes

- [Fastlane / frameit-frames](https://github.com/fastlane/frameit-frames): modelos del X al 14 y series 16 y 17.
- [Monkr](https://github.com/blaineam/Monkr): serie 15, Air y serie 18 Pro.
- Los seis marcos iniciales conservan sus fuentes indicadas en [FRAME-CREDITS.md](./FRAME-CREDITS.md). El SE ahora usa su frontal de 2.ª generación y sus tres colores.

Las URLs exactas están fijadas a revisiones concretas en [scripts/iphone-frame-sources.json](./scripts/iphone-frame-sources.json). Las imágenes mantienen los derechos de sus titulares; las licencias del código de las colecciones no se extienden automáticamente a los recursos de Apple.

## Actualizar

Ejecutar, en orden:

```powershell
node scripts/discover-iphone-frames.mjs
node scripts/import-iphone-frames.mjs
node scripts/document-iphone-frames.mjs
```

El importador verifica el centro transparente de cada pantalla y que la máscara no escape al exterior. Los errores se registran en `test-results/iphone-import-failures.json`. La compilación y el uso de la extensión funcionan sin consultar estas fuentes.
