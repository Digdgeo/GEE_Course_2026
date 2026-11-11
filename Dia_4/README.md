# Día 4 — Una aplicación en Python

**Viernes 13 de noviembre · 9:00-15:00**

La misma idea de ayer, pero con Python detrás: cuando el análisis se sale de lo que GEE
hace solo, o hay datos propios, pandas o una base de datos por medio.

## 🎯 Objetivos

- Montar un cuadro de mando con geemap: mapa, gráfica y controles.
- Sacar datos de GEE a pandas y volver, sin pelearse con los tipos.
- Publicar la aplicación con solara o voila, y saber qué hace falta para que siga en pie.
- Tener criterio para elegir: ¿Code Editor o Python?

## 📚 Contenidos

### 1. Del cuaderno al cuadro de mando (~2 h)

- `geemap.Map` dentro de un cuaderno, capas y control de capas.
- `ipywidgets`: desplegables, deslizadores, botones y el patrón observador que los une.
- Gráficas con plotly o altair alimentadas desde `ee_to_df`.
- **Estadísticas zonales como motor del cuadro de mando**: `reduceRegions` sobre los
  polígonos del usuario, tabla a pandas y gráfica que se actualiza con la selección.

### 2. Machine learning, lo justo y bien hecho (~1 h 30)

- `ee.Classifier.smileRandomForest`: entrenar con muestras y aplicar a una imagen.
- Lo que de verdad importa: **separar entrenamiento y validación**, matriz de confusión,
  exactitud por clase y no solo la global, y `explain()` para ver qué bandas pesan.
- El error más repetido: validar con los mismos puntos del entrenamiento y celebrar
  un 98 %.

### 3. Publicar la aplicación (~1 h 30)

- **solara** o **voila**: de cuaderno a aplicación web.
- Dónde vive después: Hugging Face Spaces, un servidor propio, Cloud Run.
- La diferencia con una App del Code Editor: aquí **tú** pones la máquina; allí la pone
  Google y gasta tu cuota.
- Criterio para elegir, en una tabla:

| | Code Editor App | Python (solara/voila) |
|---|---|---|
| Despliegue | Un botón | Tú montas el servicio |
| Coste | Tu cuota de GEE | Tu cuota **y** la máquina |
| Datos de fuera de GEE | No | Sí |
| pandas, scikit-learn, una base de datos | No | Sí |
| Para enseñar algo rápido | ✅ | Demasiado |

## 💻 Scripts del día

| Script | Qué enseña |
|---|---|
| `alphaearth_parecido.js` | **AlphaEarth Foundations**: buscar por parecido con los *embeddings*, sin entrenar nada |
| `clasificacion.js` | Clasificación supervisada, la versión JavaScript |
| `ndvi2gif_intro.ipynb` | Composiciones estacionales y animaciones |
| *(por escribir)* `dashboard_geemap.ipynb` | Mapa + gráfica + selector en un cuaderno |
| *(por escribir)* `clasificacion_validacion.ipynb` | Clasificador con la validación bien hecha |
| *(por escribir)* `alphaearth_parecido.ipynb` | El gemelo en Python de `alphaearth_parecido.js` |
| *(por escribir)* `app_solara.py` | El cuaderno convertido en aplicación |

## ✅ Ejercicio del día

Un cuadro de mando propio: mapa, un control y una gráfica que responda. Publicado si da
tiempo; si no, funcionando en local.

## 🎯 Para el lunes

El último día es de colaboración en abierto. **Trae elegido el repositorio** y, si puedes,
el *issue* concreto en el que quieres trabajar. Si no se te ocurre ninguno, el lunes hay
una lista preparada.

## 📖 Para profundizar

- [geemap](https://geemap.org/) · [solara](https://solara.dev/)
- [Clasificación supervisada](https://developers.google.com/earth-engine/guides/classification)
