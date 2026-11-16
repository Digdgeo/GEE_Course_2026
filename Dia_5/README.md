# Día 5 — Colaborar en abierto: tu código en un proyecto de verdad

**Lunes 16 de noviembre · 9:00-15:00**

El día que separa «tengo un script» de «mi trabajo lo puede usar otro». Se termina el
curso con una contribución real, revisada y aceptada.

## 🎯 Objetivos

- Recorrer entero el flujo de contribución: *issue* → *fork* → rama → *commit* → PR.
- Escribir un *pull request* que alguien quiera revisar.
- Revisar el PR de otra persona y contestar a los comentarios que reciba el tuyo.
- Terminar con **al menos una contribución propia abierta** en un repositorio real.

## 📚 Contenidos

### 1. Anatomía de un proyecto abierto (~1 h)

- Qué mirar antes de tocar nada: `README`, `CONTRIBUTING`, licencia, *issues* abiertos,
  cómo se ha hecho lo que ya está.
- *Issues*: cómo se escribe uno bueno y qué es una etiqueta `good first issue`.
- Qué se considera una contribución: no solo código. Documentación, ejemplos, un cuaderno
  de uso, un caso de prueba, una traducción o un error reproducido también lo son — y a
  menudo valen más.

### 2. El flujo, hecho en clase (~2 h)

- *Fork*, rama con nombre que diga algo, cambios pequeños, *commits* con mensaje legible.
- Abrir el PR: título, descripción, qué problema resuelve, cómo probarlo.
- La revisión: comentarios en línea, cambios pedidos, `git push` a la misma rama.
- Conflictos y cómo no asustarse.
- **Todo esto se puede hacer desde el navegador**; quien quiera, en local con git.

### 3. Tu contribución (~2 h 30)

Dos niveles, y se puede hacer los dos:

1. **Al repositorio del curso** — garantizado para todo el mundo: añade tu aplicación del
   jueves o del viernes a `aplicaciones/`, con una captura y cuatro líneas explicando qué
   hace. Es un PR de verdad, con su revisión.
2. **A un repositorio real** — [Ndvi2Gif](https://github.com/Digdgeo/Ndvi2Gif) es la casa,
   y hay *issues* preparados para el curso; pero vale cualquier proyecto abierto que uses.

### 4. Revisión cruzada y cierre (~30 min)

Cada quien revisa el PR de otra persona. Se ven en común los tres o cuatro mejores, se
comenta qué los hace buenos y se cierra el curso.

## 💻 Material del día

| Fichero | Qué es |
|---|---|
| [`GEE_CSIC_2025_1.ipynb`](scripts/GEE_CSIC_2025_1.ipynb) | **Introducción a geemap**: el mapa interactivo, vectores y ROIs dibujados, SRTM, Landsat, índices y máscaras, colecciones y compuestos, y el bloque de exportaciones |
| [`zonales_reduceregions.ipynb`](scripts/zonales_reduceregions.ipynb) | `reduceRegion` contra `reduceRegions`, reductores combinados y agrupados, la caída a pandas con `ee_to_df`, figura y CSV, y las palancas de memoria y tiempo |
| *(por escribir)* `GUIA_PR.md` | El flujo completo en capturas, para seguir sin perderse |
| *(por escribir)* `issues_sugeridos.md` | Lista de tareas preparadas en Ndvi2Gif y en el repo del curso |

Los dos cuadernos venían del día 2 y se quedaron sin dar: el reparto final fue **un lenguaje
por día**, así que la parte de Python es hoy. En la celda de inicialización hay que poner
**tu** proyecto de Earth Engine, no el que viene escrito.

Y para la parte de **ndvi2gif**, los tres cuadernos del taller de las Jornadas de
Ecoinformática, que se abren en Colab de un clic desde el
[README del taller](https://github.com/Digdgeo/Ndvi2Gif/tree/master/workshops/ecoinformatica):
ROIs y estadísticos (con el GIF y la exportación para QGIS), hidroperiodo y fenología.

## ✅ Ejercicio final

Un *pull request* abierto, con descripción que se entienda, y una revisión hecha al de un
compañero.

## 📖 Para profundizar

- [GitHub Flow](https://docs.github.com/es/get-started/using-github/github-flow)
- [Cómo contribuir a código abierto](https://opensource.guide/es/how-to-contribute/)
- [Ndvi2Gif](https://github.com/Digdgeo/Ndvi2Gif)

---

## 🎓 Cierre del curso

Lo que te llevas: una cuenta de GEE que entiendes y sabes lo que cuesta, criterio para
saber qué es caro y por qué, dos aplicaciones hechas —una en cada mundo— y una
contribución tuya en un proyecto abierto. Lo que no te llevas: la ilusión de que el
satélite mide la verdad. Mide lo que ve, cuando puede verlo.
