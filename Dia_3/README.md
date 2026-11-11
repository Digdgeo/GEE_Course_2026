# Día 3 — Una aplicación desde el Code Editor

**Jueves 12 de noviembre · 9:00-15:00**
*(la sesión del miércoles 11 se trasladó por la huelga general)*

De un script a algo que puede usar alguien que no programa. Hoy se monta y se **publica**
una aplicación entera en JavaScript.

## 🎯 Objetivos

- Construir una interfaz con los componentes `ui.*` del Code Editor.
- Conectar la interfaz al análisis sin recalcularlo todo en cada clic.
- Publicar una App y entender qué implica: quién entra, quién paga, qué se versiona.
- Salir con una aplicación propia publicada y con enlace.

## 📚 Contenidos

### 1. Los componentes (~1 h 30)

- `ui.Panel`, `ui.Label`, `ui.Button`, `ui.Select`, `ui.Slider`, `ui.Textbox`.
- Diseño: paneles anidados, estilos, `ui.SplitPanel` para comparar dos fechas.
- `ui.Chart` dentro de la interfaz, alimentado por la serie temporal del día 2.
- Eventos: `onClick`, `onChange`, `Map.onClick`.

### 2. Que no vaya lenta (~1 h)

- El error clásico: recalcular la colección entera en cada evento.
- Qué guardar en el estado de la aplicación y qué recalcular.
- Precalcular a *asset* lo que no cambia, y por qué una App que tarda 30 s no la usa nadie.

### 3. Publicar (~1 h)

- De script a **App**: el flujo, el nombre, el enlace, quién puede verla.
- **La App corre con tu cuota**, no con la del visitante — enlaza con los precios del día 1.
- *Assets* privados: lo que tú ves y tus visitantes no.
- Versionado: la App apunta a una copia del código, no a tu script vivo.

### 4. Caso práctico: visor de inundación de la marisma (~2 h)

Se monta entre todos una aplicación de verdad, la que se usa en el LAST-EBD reducida a lo
que cabe en una mañana: selector de fecha, máscara de inundación sobre la imagen de fondo,
slide para comparar dos fechas y una gráfica de superficie inundada.

Está escrita en los cuatro `app_0*.js`, que se recorren en orden. El contorno del parque sale
de **WDPA** (World Database on Protected Areas, del WCMC): límite oficial, citable y de una
línea de código, en lugar de una caja dibujada a mano. Y la gráfica lleva dos series, la
inundada y la **observada**, porque los desplomes de la primera caen casi siempre donde se
desploma la segunda: no son bajadas de agua, son días de nubes.

**Segundo caso: [`algas_embalses_base.js`](scripts/algas_embalses_base.js).**
Afloramientos de algas en embalses andaluces, por si prefieres montar tu aplicación sobre
algo que no sea Doñana. El análisis está escrito y comentado, y la interfaz **no**: eso es
justamente el ejercicio. El propio script termina con la lista de qué `ui.*` va en cada
sitio y dónde encaja.

Se monta en este orden a propósito —primero el análisis, luego la interfaz—, que es el que
nunca se sigue y el que evita descubrir que lo que ibas a envolver no funcionaba.

## 💻 Scripts del día

Los cuatro primeros son **una sola cadena**: el mismo análisis —la lámina de agua de la
marisma de Doñana— con una interfaz que crece. El análisis no cambia nunca de un script al
siguiente, y eso es justamente el mensaje del día.

| Script | Qué enseña |
|---|---|
| [`app_01_panel_basico.js`](scripts/app_01_panel_basico.js) | `ui.Panel`, `ui.Label` y `ui.Button`, `Map.onClick`, y **`evaluate()` en lugar de `getInfo()`**, que es la regla del día |
| [`app_02_selector_fechas.js`](scripts/app_02_selector_fechas.js) | `ui.Select` alimentado desde el servidor, `ui.Slider` para el umbral, y la capa que se **sustituye** en vez de acumularse. Con el aviso de cobertura: lo que no se vio no es agua que no hay |
| [`app_03_splitpanel.js`](scripts/app_03_splitpanel.js) | Dos mapas con `ui.Map`, `ui.Map.Linker` para que vayan juntos y `ui.SplitPanel` con slide. Febrero de 2026 contra marzo de 2024 |
| [`app_04_inundacion.js`](scripts/app_04_inundacion.js) | **El visor completo**: panel lateral, slide, la gráfica del ciclo con la superficie observada encima, leyenda a mano, serie del píxel al pinchar, estado de la aplicación y las cuatro cosas que hay que saber antes de publicar |
| [`algas_embalses_base.js`](scripts/algas_embalses_base.js) | **El análisis antes de la interfaz**: afloramientos de algas en seis embalses andaluces, con NDCI y FAI sobre la lámina de agua del JRC. Sin un solo `ui.*` |

## ✅ Ejercicio del día

Una App propia publicada, con enlace que se pueda abrir desde el móvil. Se valora que
**funcione y se entienda sin explicación**, no que tenga muchos botones.

## 📖 Para profundizar

- [Earth Engine Apps](https://developers.google.com/earth-engine/guides/apps)
- [ui.Panel](https://developers.google.com/earth-engine/apidocs/ui-panel)
