/**
 * Día 3 · App 1/4 — El panel, la etiqueta y un botón que hace algo
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * ESTE ES EL PRIMER SCRIPT DEL DÍA y el más corto a propósito. Toda la cadena
 * de los cuatro trabaja sobre el mismo análisis —la lámina de agua de la
 * marisma de Doñana—, así que el análisis se escribe una vez aquí y en los
 * siguientes solo cambia la interfaz.
 *
 * QUÉ SE APRENDE
 *   1. `ui.Panel`, `ui.Label` y `ui.Button`: los tres ladrillos de todo.
 *   2. Que un widget no sabe nada de Earth Engine: hay que darle **texto**.
 *   3. `evaluate()` en lugar de `getInfo()`, que es LA regla del día.
 *   4. `Map.onClick` para interrogar un píxel.
 *
 * ESTO SOLO FUNCIONA EN EL CODE EDITOR. Los componentes `ui.*` no existen en
 * la API de Python: en Python la interfaz se monta con otras herramientas, y
 * eso es el día 4. Si pegas esto en un notebook, no va.
 */

// ===========================================================================
// 1. EL ANÁLISIS, QUE YA SABEMOS HACER
// ===========================================================================

/*
 * Nada de este bloque es nuevo: es el día 2 con otro índice. Conviene verlo
 * así desde el principio, porque es el mensaje del día: **una aplicación no es
 * un análisis más difícil, es un análisis normal con una interfaz encima**.
 */

// El contorno del Parque Nacional de Doñana, de la World Database on Protected
// Areas del WCMC. No es una caja dibujada a mano: es el límite oficial, y se
// puede citar.
//
// Se filtra por `SITE_ID`, que es el identificador del sitio y no cambia de
// nombre ni de idioma. Si algún día esta línea devuelve 0 elementos es que
// WDPA ha cambiado el esquema de la tabla: entonces, o se busca el campo nuevo
// (`print(parque.first())` lo enseña) o se usa la caja del final del script.
var parque = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filter(ee.Filter.eq('SITE_ID', 389012));

print('Polígonos del parque (debe ser 1):', parque.size());

var ROI = parque.geometry();

// 53.327 ha. Lo dejamos escrito como número porque la interfaz lo va a usar
// para calcular porcentajes, y pedirle al servidor el área del parque en cada
// clic es tirar el tiempo: no cambia.
var AREA_PARQUE_HA = 53327;

// La fecha de hoy es fija. En el script 2 la elige el usuario.
var FECHA = '2026-02-14';

/*
 * Sentinel-2 L2A. Dos decisiones que ya salieron en el día 2 y que aquí se
 * repiten porque son las que más se equivocan:
 *
 *   - La colección es la HARMONIZED. Desde la *baseline* 04.00 (enero de 2022)
 *     los productos L2A llevan un offset de −1000 que las anteriores no
 *     tenían. La colección «harmonizada» lo deshace, así que una serie que
 *     cruza 2022 es comparable y `divide(10000)` vale para todas las fechas.
 *     Con `COPERNICUS/S2_SR` a secas, el salto está ahí y no avisa.
 *
 *   - Las nubes se quitan con la banda **SCL**, no con QA60. QA60 viene vacía
 *     desde esa misma baseline: el código se ejecuta, no da error y no
 *     enmascara nada. Es el fallo silencioso más caro de Sentinel-2.
 */
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(ROI);

function sinNubes(imagen) {
  var scl = imagen.select('SCL');
  // 3 sombra de nube · 8 nube media · 9 nube alta · 10 cirros · 11 nieve
  var mala = scl.eq(3).or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  return imagen.updateMask(mala.not());
}

// MNDWI = (verde − SWIR1) / (verde + SWIR1). Por encima de 0, agua.
function mndwi(imagen) {
  return sinNubes(imagen)
    .divide(10000)
    .normalizedDifference(['B3', 'B11'])
    .rename('mndwi')
    .copyProperties(imagen, ['system:time_start']);
}

var fecha = ee.Date(FECHA);

// Varias escenas del mismo día: la marisma cae en dos pasadas de Sentinel-2,
// así que hay que mosaicarlas o se mide media marisma.
var indice = s2
  .filterDate(fecha, fecha.advance(1, 'day'))
  .map(mndwi)
  .mosaic()
  .select('mndwi');

var agua = indice.gt(0).selfMask();

// ===========================================================================
// 2. EL MAPA
// ===========================================================================

Map.setOptions('SATELLITE');
Map.centerObject(ROI, 10);

Map.addLayer(parque.style({color: 'ffffff', fillColor: '00000000', width: 2}),
             {}, 'Parque Nacional');
Map.addLayer(agua, {palette: ['#1f6feb']}, 'Lámina de agua ' + FECHA);

// ===========================================================================
// 3. EL PANEL Y LAS ETIQUETAS
// ===========================================================================

/*
 * `ui.Panel` es una caja que contiene widgets. Lo único que hay que entender
 * es el **layout**: `flow('vertical')` los apila, `flow('horizontal')` los pone
 * en fila. Un panel dentro de otro panel es como se construye cualquier
 * interfaz, y no hay más.
 *
 * El `style` es CSS con otro nombre. Los que se usan de verdad:
 *   width, padding, margin, backgroundColor, fontSize, fontWeight, color,
 *   position ('top-left', 'bottom-right'...), stretch, shown.
 */
var panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    width: '300px',
    padding: '10px',
    position: 'top-left',
    backgroundColor: 'rgba(255, 255, 255, 0.92)'
  }
});

var titulo = ui.Label('Inundación de la marisma', {
  fontSize: '18px',
  fontWeight: 'bold',
  margin: '4px 0 0 0'
});

var subtitulo = ui.Label('Parque Nacional de Doñana · ' + FECHA, {
  fontSize: '12px',
  color: '#666',
  margin: '0 0 10px 0'
});

// Esta etiqueta es la que va a cambiar. Nace con un texto de espera, porque
// una etiqueta vacía parece una interfaz rota.
var resultado = ui.Label('Pulsa el botón para medir.', {
  fontSize: '14px',
  margin: '8px 0 0 0'
});

panel.add(titulo);
panel.add(subtitulo);

// El panel se añade **al mapa**, no a `ui.root`. Así flota encima y no hay que
// pelearse con el reparto del espacio. Para el panel lateral de verdad,
// script 4.
Map.add(panel);

// ===========================================================================
// 4. UN BOTÓN QUE HACE ALGO
// ===========================================================================

/*
 * Aquí está el único concepto difícil del día, y es el del día 1 otra vez:
 *
 *   El widget vive en TU NAVEGADOR. El número vive en LOS SERVIDORES DE GOOGLE.
 *
 * `ui.Label` quiere una cadena de texto, ahora. Un `ee.Number` no es un
 * número: es la promesa de un número que todavía no se ha calculado. Si se lo
 * pasas a la etiqueta, escribe algo ilegible o nada.
 *
 * Hay dos maneras de convertirlo, y una de ellas está prohibida:
 *
 *   getInfo()   ->  trae el valor, pero **congela el navegador** hasta que
 *                   llega. En un script da igual. En una aplicación es la
 *                   diferencia entre una herramienta y algo que nadie usa.
 *   evaluate()  ->  lo pide y sigue; cuando llega, ejecuta tu función.
 *
 * REGLA DEL DÍA: en una aplicación, `getInfo()` nunca. Siempre `evaluate()`.
 */

function medirArea() {
  resultado.setValue('Midiendo…');

  // El área de cada píxel en m². Multiplicada por la máscara de agua y sumada,
  // da la superficie inundada. Es el patrón de siempre.
  var m2 = agua.multiply(ee.Image.pixelArea())
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ROI,
      // 30 m, no 10 m. A 10 m son 5,3 millones de píxeles y a 30 m son 590.000.
      // Medido sobre esta misma fecha: 19.312 ha a 10 m y 27.557 ha a 30 m
      // —una diferencia del 0,005 %— y menos de la mitad de espera. En una
      // interfaz, eso decide si la usa alguien.
      scale: 30,
      maxPixels: 1e9
    })
    .get('mndwi');

  var ha = ee.Number(m2).divide(10000);

  // Y aquí el cambio de mundo. Todo lo que dependa del valor va DENTRO de la
  // función de vuelta: fuera de ella el número todavía no existe.
  ha.evaluate(function (valor) {
    if (valor === null) {
      resultado.setValue('Sin dato: no hay escena válida para esta fecha.');
      return;
    }
    var pct = (valor / AREA_PARQUE_HA * 100).toFixed(1);
    // Una sola cadena y un separador: `ui.Label` no interpreta saltos de
    // línea. Si quieres dos renglones, son dos etiquetas.
    resultado.setValue(valor.toFixed(0) + ' ha inundadas  ·  ' +
                       pct + ' % del parque');
  });
}

var boton = ui.Button({
  label: 'Medir la superficie inundada',
  onClick: medirArea,
  style: {stretch: 'horizontal'}
});

panel.add(boton);
panel.add(resultado);

/*
 * CONTROL — con el script tal cual, el botón tiene que dar:
 *
 *   27.557 ha · 51,7 % del parque
 *
 * Si sale eso, la cadena entera está bien: el contorno, el mosaico del día, la
 * máscara de nubes, el índice y el reductor. Si sale la mitad, probablemente se
 * ha perdido el `.mosaic()` y estás midiendo una sola pasada.
 */

// ===========================================================================
// 5. MAP.ONCLICK: PREGUNTARLE A UN PÍXEL
// ===========================================================================

/*
 * El gesto que convierte un mapa en un instrumento. El usuario pincha y la
 * aplicación responde por ese punto concreto.
 *
 * `Map.onClick` entrega las coordenadas **en el cliente** (un objeto con lon y
 * lat, números de verdad), así que hay que volver a subirlas al servidor con
 * `ee.Geometry.Point` para preguntar por ellas.
 */
var pixel = ui.Label('', {fontSize: '12px', color: '#444', margin: '10px 0 0 0'});
panel.add(ui.Label('Pincha en el mapa:', {fontSize: '12px', margin: '12px 0 0 0'}));
panel.add(pixel);

Map.onClick(function (coords) {
  pixel.setValue('Consultando…');

  var punto = ee.Geometry.Point([coords.lon, coords.lat]);

  // Un solo píxel: aquí sí se va a la resolución nativa del índice. El coste de
  // un píxel es cero, y redondear a 30 m una consulta puntual sería absurdo.
  var valor = indice.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: punto,
    scale: 20
  }).get('mndwi');

  valor.evaluate(function (v) {
    if (v === null) {
      pixel.setValue('Ese píxel no se vio: nube, sombra o fuera de escena.');
      return;
    }
    pixel.setValue('MNDWI = ' + v.toFixed(3) +
                   (v > 0 ? '  →  agua' : '  →  seco'));
  });
});

/*
 * Fíjate en el caso del `null`. No es defensa paranoica: en la marisma, con
 * nubes, es la respuesta más frecuente del invierno. Y la diferencia entre
 * «no hay agua» y «no se ha visto» es el error que más se cuela en los
 * trabajos de inundación — el día 2 ya salió con `.count()`, y en el script 2
 * lo vamos a poner en la interfaz.
 */

// ===========================================================================
// 6. EJERCICIO
// ===========================================================================

/*
 * 1. Añade un segundo botón que mida el área con el umbral en 0,2 en vez de 0.
 *    ¿Cuánto cambia? (Es más de lo que parece, y es el tema del script 2.)
 *
 * 2. Cambia FECHA a '2026-09-02' y vuelve a medir. Son 133 ha: la misma
 *    marisma, seis meses después. Ese contraste es la aplicación entera.
 *
 * 3. Pon `getInfo()` en lugar de `evaluate()` en `medirArea` y mira la
 *    interfaz mientras calcula: los botones no responden. Ahora imagina esa
 *    aplicación en el móvil de alguien que no sabe que está esperando.
 *
 * 4. Mueve el panel a 'bottom-right' y ponle 400 px de ancho.
 */

// ---------------------------------------------------------------------------
// LA CAJA DE REPUESTO, si WDPA cambiara y la línea del filtro fallara:
//
//   var ROI = ee.Geometry.Rectangle([-6.49, 36.85, -6.26, 37.14]);
//
// Da un número distinto (el recorte no es el parque), pero la aplicación corre
// y la clase sigue. Tener el plan B escrito es parte del oficio.
// ---------------------------------------------------------------------------
