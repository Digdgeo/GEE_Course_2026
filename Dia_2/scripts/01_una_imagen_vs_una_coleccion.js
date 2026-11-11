/**
 * Día 2 · 1. Una imagen contra una colección de imágenes
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * EL SCRIPT FUNDAMENTAL DEL CURSO. Si te llevas solo uno, que sea este.
 *
 * Todo lo que viene después —compuestos estacionales, series temporales,
 * tendencias, las aplicaciones de los días 3 y 4— es la misma idea repetida:
 * **dejar de pensar en una imagen y empezar a pensar en una colección**. Ese
 * salto es el curso entero, y aquí se da despacio y en un sitio:
 *
 *   §1  El NDVI de UNA imagen.          ee.Image     → una fecha, un número
 *   §2  El NDVI de MUCHAS imágenes.     ee.ImageCollection → muchas fechas
 *   §3  De la colección a una imagen otra vez: los reductores.
 *   §4  La trampa: lo que un compuesto esconde.
 *
 * Al final se ve por qué `ndvi_estacional.js` hace lo que hace, y no antes.
 */

// ---------------------------------------------------------------------------
// 0. La zona de estudio y la fecha
// ---------------------------------------------------------------------------

// Los arrozales del bajo Guadalquivir: un sitio donde el ciclo de la vegetación
// es brutal —de agua desnuda en mayo a verde cerrado en agosto—, así que todo
// lo que viene se ve a simple vista.
var zona = ee.Geometry.Rectangle([-6.25, 37.05, -6.05, 37.20]);

Map.centerObject(zona, 11);

var visNDVI = {min: 0, max: 0.8, palette: ['c9b49a', 'f5f5ad', '7fbc41', '276419']};
var visColor = {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.25};

// =========================================================================
// 1. UNA SOLA IMAGEN
// =========================================================================

/*
 * `ee.Image` es UNA imagen: una fecha, un sensor, unas bandas. Es el objeto
 * con el que trabaja cualquier SIG de escritorio, y el único que la mayoría de
 * la gente ha usado antes de llegar aquí.
 */

// Para quedarse con UNA imagen hay dos caminos. El directo es escribir su
// identificador: `ee.Image('COPERNICUS/S2_SR_HARMONIZED/2024...')`. El problema
// es de dónde sale ese identificador, así que aquí se lo pedimos a la colección:
// las escenas de agosto, la menos nubosa primero, y nos quedamos la primera.
var cruda = ee.Image(
  ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(zona)
    .filterDate('2024-08-01', '2024-08-31')
    .sort('CLOUDY_PIXEL_PERCENTAGE')
    .first()
);

print('--- UNA IMAGEN ---');
print('El objeto entero:', cruda);              // despliégalo en la consola
print('Su identificador:', cruda.get('system:index'));   // cópialo si lo quieres fijo
print('Sus bandas:', cruda.bandNames());
print('Su fecha:', ee.Date(cruda.get('system:time_start')));
print('Nubes declaradas (%):', cruda.get('CLOUDY_PIXEL_PERCENTAGE'));

// Los productos vienen como enteros; para trabajar en reflectividad hay que
// escalarlos. CUIDADO: una operación aritmética devuelve una imagen NUEVA y se
// deja las propiedades por el camino, la fecha incluida. Si las necesitas
// después, hay que copiarlas a mano. Es un tropiezo clásico.
//
// Y ahí viene el segundo tropiezo, que va pegado al primero: **`copyProperties`
// no devuelve un `ee.Image`, devuelve un `ee.Element`**, que es el tipo padre
// del que cuelgan imágenes, *features* y colecciones. Un Element no sabe hacer
// `clip` ni `normalizedDifference`, así que la línea siguiente fallaría con:
//
//     unaImagen.clip is not a function. Earth Engine requires you to specify
//     the object type before calling 'clip'.
//
// Por eso se envuelve en `ee.Image(...)`. No convierte nada: solo le dice al
// cliente de JavaScript de qué tipo es el objeto que ya tenía, para que le deje
// llamar a los métodos de imagen. Lo mismo pasa con `coleccion.first()`, que
// también devuelve un Element.
var unaImagen = ee.Image(
  cruda.divide(10000).copyProperties(cruda, ['system:time_start']));

Map.addLayer(unaImagen.clip(zona), visColor, '1. Color natural, agosto 2024');

// El NDVI: (NIR − Rojo) / (NIR + Rojo). En Sentinel-2, B8 y B4.
// `normalizedDifference` hace la cuenta y evita escribir la fórmula a mano,
// que es donde se cuelan los errores de signo.
var ndviUnaImagen = unaImagen.normalizedDifference(['B8', 'B4']).rename('NDVI');

Map.addLayer(ndviUnaImagen.clip(zona), visNDVI, '1. NDVI de esa imagen');

// Un número concreto: el NDVI medio de la zona ese día.
var mediaUnDia = ndviUnaImagen.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: zona,
  scale: 20,
  maxPixels: 1e9
});
print('NDVI medio del 12 de agosto:', mediaUnDia.get('NDVI'));

/*
 * HASTA AQUÍ no hay nada que no se pueda hacer en QGIS. La pregunta que abre
 * el resto del curso es: **¿y si esa imagen tenía nubes? ¿y si ese día no
 * representa el año? ¿y si quiero cuarenta años?** Con una imagen no hay
 * respuesta. Hay que cambiar de objeto.
 */

// =========================================================================
// 2. UNA COLECCIÓN: MUCHAS IMÁGENES A LA VEZ
// =========================================================================

/*
 * `ee.ImageCollection` es un montón de imágenes tratadas como una sola cosa.
 * No se descargan, no se abren: se FILTRAN y se les aplica una operación a
 * todas de golpe. Esto es lo que no tiene equivalente en un SIG de escritorio.
 */

// Lo mismo que se usó arriba para pescar una escena, pero ahora el objetivo es
// la colección entera, no una imagen de ella.
var coleccion = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(zona)                          // dónde
  .filterDate('2024-01-01', '2024-12-31');     // cuándo

print('--- UNA COLECCIÓN ---');
print('Escenas de 2024 sobre la zona:', coleccion.size());

// El orden de los filtros no cambia el resultado, pero sí el tiempo: primero
// los que quitan más. `filterBounds` y `filterDate` antes que cualquier otro.
var limpia = coleccion.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
print('Y con menos del 20 % de nubes:', limpia.size());

// Una función que calcula el NDVI de UNA imagen...
function anadirNDVI(imagen) {
  var ndvi = imagen.divide(10000).normalizedDifference(['B8', 'B4']).rename('NDVI');
  return imagen.addBands(ndvi).copyProperties(imagen, ['system:time_start']);
}

// ...y `.map()`, que la aplica a TODAS. Esto es el `forEach` del repaso de
// JavaScript, pero ejecutándose en los servidores de Google sobre cada escena.
// Aquí no hay bucle, y es importante que no lo haya: un `for` sobre una
// colección es el error más caro que se puede cometer en Earth Engine.
var conNDVI = limpia.map(anadirNDVI);

// La serie temporal: el mismo número del §1, pero repetido para cada escena.
// Compara este gráfico con el único valor que daba una imagen suelta.
print(ui.Chart.image.series({
  imageCollection: conNDVI.select('NDVI'),
  region: zona,
  reducer: ee.Reducer.mean(),
  scale: 20
}).setOptions({
  title: 'NDVI medio de la zona, escena a escena, 2024',
  vAxis: {title: 'NDVI'},
  lineWidth: 2,
  pointSize: 4
}));

// =========================================================================
// 3. DE LA COLECCIÓN A UNA IMAGEN: LOS REDUCTORES
// =========================================================================

/*
 * Una colección no se puede pintar: ¿cuál de las sesenta escenas? Para verla
 * hay que REDUCIRLA a una imagen, y la elección del reductor no es un detalle
 * técnico: es una decisión sobre qué pregunta estás haciendo.
 */

var soloNDVI = conNDVI.select('NDVI');

var mediana = soloNDVI.median();   // el año «típico»: lo más robusto a nubes
var maximo  = soloNDVI.max();      // el verde máximo: cuándo la planta pudo más
var minimo  = soloNDVI.min();      // el suelo desnudo, o el agua
var cuantos = soloNDVI.count();    // ¡CUÁNTAS escenas hay en cada píxel!

Map.addLayer(mediana.clip(zona), visNDVI, '3. Mediana de 2024');
Map.addLayer(maximo.clip(zona),  visNDVI, '3. Máximo de 2024', false);
Map.addLayer(minimo.clip(zona),  visNDVI, '3. Mínimo de 2024', false);

// Esta capa es la que nadie mira y la que explica la mitad de los resultados
// raros: el número de observaciones válidas cambia de un píxel a otro, porque
// las nubes no caen igual en todas partes.
Map.addLayer(cuantos.clip(zona), {min: 0, max: 60, palette: ['red', 'yellow', 'green']},
             '3. Nº de escenas válidas por píxel', false);

print('--- REDUCTORES ---');
print('Mediana del NDVI medio:', mediana.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: zona, scale: 20, maxPixels: 1e9}).get('NDVI'));
print('Máximo del NDVI medio:', maximo.reduceRegion({
  reducer: ee.Reducer.mean(), geometry: zona, scale: 20, maxPixels: 1e9}).get('NDVI'));

// =========================================================================
// 4. LA TRAMPA: LO QUE UN COMPUESTO ESCONDE
// =========================================================================

/*
 * El compuesto anual de arriba dice que esta zona tiene un NDVI mediano
 * discreto. Es verdad y es inútil: aquí hay un arrozal, que pasa de agua a
 * selva y vuelve. La mediana del año no describe nada real, describe el punto
 * medio de un recorrido.
 *
 * Mira las dos capas siguientes, que son la misma zona con cuatro meses de
 * diferencia. La mediana anual está entre las dos y no se parece a ninguna.
 */

var mayo   = soloNDVI.filterDate('2024-05-01', '2024-05-31').median();
var agosto = soloNDVI.filterDate('2024-08-01', '2024-08-31').median();

Map.addLayer(mayo.clip(zona),   visNDVI, '4. Solo mayo');
Map.addLayer(agosto.clip(zona), visNDVI, '4. Solo agosto');

/*
 * Y ESA es la razón de ser del script siguiente. Si la mediana anual borra la
 * estacionalidad, la salida no es un reductor mejor: es **trocear el año y
 * reducir cada trozo por separado**. Cuatro trozos, cuatro imágenes, una por
 * estación, y las tres primeras puestas como R, G y B.
 *
 *   → `ndvi_estacional.js`, que es exactamente eso y ya no debería sorprender.
 */

// =========================================================================
// 5. EJERCICIO
// =========================================================================

/*
 * 1. Cambia el umbral de nubes de 20 a 80 y mira cómo cambian `size()`, el
 *    gráfico y la mediana. ¿Cuál de los tres se estropea más?
 * 2. Sustituye `.median()` por `.mean()` en el compuesto anual y busca en el
 *    mapa dónde se diferencian. Pista: donde quedó alguna nube sin filtrar.
 * 3. Baja la capa del número de escenas y busca el píxel con menos
 *    observaciones de la zona. ¿Te fiarías de su mediana?
 * 4. Repite el §1 con una escena de enero. ¿Sigue valiendo lo que concluimos
 *    en agosto?
 */
