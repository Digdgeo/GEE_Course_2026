# Extras

Scripts que **no están en el programa de ningún día** y se dejan aquí porque enseñan cosas
que merecen la pena y porque responden preguntas que suelen salir. Vienen de ediciones
anteriores del curso (2022-2025) y se han tocado lo justo para que **corran al pegarlos en
el Code Editor**, sin dibujar geometrías ni cargar *assets*.

No hay que leerlos para seguir el curso: son para después, o para el rato en que uno se
queda con la curiosidad.

Esto es contenido de Earth Engine. Para el repaso de **JavaScript** desde cero, que es
otra cosa, está [`Dia_1/repaso_js/`](../Dia_1/repaso_js/).

Todos llevan en la cabecera sus **cifras de control**: lo que tiene que salir al ejecutarlos.
Si lo que te sale es muy distinto, algo ha cambiado y merece la pena mirar qué.

| Script | Qué enseña | Con qué se relaciona |
| [`ndvi_estacional_manual.js`](ndvi_estacional_manual.js) | El NDVI estacional escrito a mano, una variable por estación y por año | Con `Dia_2/scripts/ndvi_estacional.js`: el antes y el después de reescribirlo con funciones |
| [`ndvi_zonas_mde.js`](ndvi_zonas_mde.js) | `.where()` en cadena para reclasificar, y **el reductor agrupado** (`mean().group(1)`) | Día 2, estadísticas zonales. El reductor agrupado es de lo más útil y de lo peor documentado de la API |
| [`barcos_sentinel1.js`](barcos_sentinel1.js) | Radar: el máximo de VH como mapa de tráfico marítimo, 2019 contra 2020 | Día 2, como ejemplo de que el radar resuelve cosas que el óptico no |
| [`alphaearth_parecido.js`](alphaearth_parecido.js) | **AlphaEarth Foundations**: los *embeddings* de 64 bandas y el mapa de «encuéntrame sitios como este», con una multiplicación y sin entrenar nada | Día 4, como alternativa a la clasificación supervisada. También sirve para medir cuánto ha cambiado un sitio entre dos años |
| [`sst_canarias.js`](sst_canarias.js) | Temperatura del mar en Canarias: el afloramiento medido, y la anomalía de 44 años con la ola de calor marina de 2023 | Día 2, series temporales. Y la disyuntiva entre resolución y longitud de la serie, que condiciona cualquier trabajo con satélite |
| [`construcciones_y_luces.js`](construcciones_y_luces.js) | **Limpiar un producto con otro**: las dunas de Matalascañas que el GHSL antiguo daba por construidas, y el cruce con las luces nocturnas para quitarlas. Y **las luces por sí mismas**: estirado logarítmico, clasificación en umbrales con leyenda, y la luz nueva de 2014 a 2023 | Día 2, máscaras y reductores (el agrupado incluido). La leyenda con `ui.*` enlaza con el día 3, y el estirado logarítmico sirve para cualquier variable con tres órdenes de magnitud |

## Qué NO está aquí, y por qué

Hubo un cuarto script, `mndwi_decadas_landsat.js`, y se ha borrado: era el mismo análisis
que `Dia_2/scripts/mndwi_decades.js` y no tenía sentido mantener dos. Lo que valía de él
—la nota sobre el *offset* de la Colección 2 y la de `reproject()` dentro de un `map()`—
está ahora dentro del script del día 2, junto al código al que se refiere.

## De dónde sale cada uno

Vienen de scripts usados en las ediciones de 2024 y 2025 del curso, salvo el de AlphaEarth
—escrito en 2026, a raíz de una pregunta de clase— y el de **construcciones y luces**, que es
un script propio de Diego, reescrito el 12 de noviembre de 2026. Lo que buscaba era
quitar los falsos positivos del GHSL en la costa de Doñana —dunas y playa dadas por
construidas— cruzándolo con las luces nocturnas, y así está planteado ahora, con las cifras
medidas. Se ha pasado al GHSL **P2023A**, porque el P2016 que usaba está deprecado y además
es el que comete el error; las épocas de construcción, que solo tiene el antiguo, quedan en
el §6 como bloque comentado. Del original se corrigen y se explican tres cosas más, porque
cada una enseña algo: calculaba la suma de las luces y pintaba la mediana con la etiqueta
«SumLights», usaba el `mask()` deprecado y llevaba dos `Map.setCenter()` de los que solo
manda el último. El del NDVI
estacional tiene una versión con funciones en `Dia_2/scripts/`, y aquí se conserva **la
versión larga** a propósito: la que se lee de arriba abajo sin funciones de por medio. El
de las zonas con reductor agrupado no tiene equivalente en el repositorio, y el de los
barcos tampoco: su hermano mayor, cuatro veces más largo, está en el
[curso de 2025](https://github.com/Digdgeo/GEE_Course_2025/blob/main/Dia_3/scripts/sentinel1_ships.js).
