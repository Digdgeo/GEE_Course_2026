/**
 * Extra · AlphaEarth Foundations: buscar por parecido, sin entrenar nada
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * Fuera de programa. Es una alternativa al bloque de clasificación
 * supervisada: la idea es la misma —«encuéntrame sitios como este»— pero sin
 * muestras de entrenamiento, sin clasificador y sin validación.
 *
 *   §1  Qué es un *embedding* y por qué 64 números bastan.
 *   §2  El mapa de parecido: producto escalar, una línea.
 *   §3  Cuatro objetivos distintos, cuatro mapas.
 *   §4  Lo mismo en el tiempo: ¿ha cambiado este sitio desde 2017?
 *   §5  Dónde está el truco, y qué NO hace esto.
 *
 * CIFRAS DE CONTROL (medidas contra Earth Engine el 11-nov-2026). Si al
 * ejecutarlo te salen muy distintas, algo se ha roto:
 *   - la longitud de los vectores es 1 (mediana 1,0015)
 *   - parecido a la marisma inundada: mediana +0,619 en el recuadro
 *   - parecido al pinar:              mediana +0,588
 *   - parecido al arrozal:            mediana +0,420
 *   - parecido a la duna móvil:       mediana +0,201
 *   - estabilidad 2017→2024: p5 0,525 · mediana 0,889 · p95 0,982
 *   - el compuesto de color natural se monta con 43 escenas de Sentinel-2
 */

// ---------------------------------------------------------------------------
// 0. La colección
// ---------------------------------------------------------------------------

/*
 * AlphaEarth Foundations es un modelo de Google que resume TODO lo que los
 * satélites vieron de un píxel durante un año —óptico, radar, térmico, en
 * muchas fechas— en 64 números. Ese vector de 64 números es el *embedding*.
 *
 * El catálogo lo publica ya calculado, como una colección anual:
 *   GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL
 *   64 bandas (A00 … A63) · 10 m · 2017-2025 · una imagen por año y sitio
 *
 * Fíjate en lo que eso significa: un año entero de Sentinel-2, Sentinel-1 y
 * Landsat sobre tu zona, ya digerido, en una sola imagen de 64 bandas.
 */
var EMB = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL');

var zona = ee.Geometry.Rectangle([-6.55, 36.85, -6.20, 37.10]);   // Doñana
var anio = 2024;

var emb = EMB.filterDate(anio + '-01-01', (anio + 1) + '-01-01')
             .filterBounds(zona)
             .mosaic()
             .clip(zona);

Map.centerObject(zona, 11);
Map.addLayer(ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
               .filterDate('2024-06-01', '2024-09-01').filterBounds(zona)
               .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10)).median().clip(zona),
             {bands: ['B4', 'B3', 'B2'], min: 200, max: 2500}, 'Color natural (verano 2024)');

// Las 64 bandas no se «ven»: no son colores. Pero tres de ellas en RGB ya
// enseñan que el vector separa cosas distintas. No le busques significado a
// cada banda: no lo tiene por separado.
Map.addLayer(emb, {bands: ['A01', 'A16', 'A09'], min: -0.3, max: 0.3},
             'Tres de las 64 bandas, en RGB', false);

// =========================================================================
// 1. POR QUÉ ESTO FUNCIONA (la parte que parece magia y no lo es)
// =========================================================================

/*
 * Olvídate por un momento de los 64 números y quédate con DOS. Un píxel sería
 * entonces un par, como (0,6 · 0,8), y eso se dibuja como una flecha desde el
 * origen. Dos píxeles parecidos apuntan hacia el mismo sitio; dos píxeles
 * distintos apuntan hacia lados distintos.
 *
 * Aquí está la clave: **lo que importa es la dirección de la flecha, no su
 * longitud**. Y AlphaEarth te lo da ya resuelto, porque todas sus flechas
 * miden exactamente 1. Es como si todos los píxeles estuvieran obligados a
 * acabar sobre el borde de un círculo: lo único en lo que se pueden diferenciar
 * es en POR DÓNDE del círculo caen.
 *
 * Y ahora, lo único que hay que creerse: si dos flechas miden 1,
 * **multiplicar sus números uno a uno y sumarlos** te dice el ángulo que
 * forman, en esta escala:
 *
 *      resultado 1   →  misma dirección      → el mismo tipo de sitio
 *      resultado 0   →  perpendiculares      → no tienen nada que ver
 *      resultado -1  →  direcciones opuestas → lo más distinto posible
 *
 * A ese «multiplica uno a uno y suma» se le llama producto escalar, y el
 * número que sale es el coseno del ángulo. Pero el nombre da igual: lo que
 * importa es que es **una multiplicación y una suma**, y que el resultado ya
 * viene en una escala cómoda de 1 a -1.
 *
 * Compruébalo con dos flechas de juguete, que esto se entiende mejor viéndolo
 * que leyéndolo:
 */
var mismaDireccion   = ee.Array([0.6,  0.8]).multiply(ee.Array([0.6,  0.8])).reduce(ee.Reducer.sum(), [0]);
var perpendiculares  = ee.Array([0.6,  0.8]).multiply(ee.Array([0.8, -0.6])).reduce(ee.Reducer.sum(), [0]);
var opuestas         = ee.Array([0.6,  0.8]).multiply(ee.Array([-0.6, -0.8])).reduce(ee.Reducer.sum(), [0]);
print('Dos flechas iguales       →', mismaDireccion);   // 1
print('Dos flechas perpendiculares →', perpendiculares); // 0
print('Dos flechas opuestas      →', opuestas);          // -1

/*
 * Con 64 números en vez de 2 no cambia nada: no te lo puedes imaginar, pero la
 * cuenta es idéntica. Multiplicas los 64 por los 64 y sumas.
 *
 * Lo único que hay que verificar es que las flechas de verdad miden 1, porque
 * de eso depende todo. La longitud de una flecha es la raíz de la suma de sus
 * números al cuadrado — Pitágoras, con 64 lados en vez de 2:
 */
var longitud = emb.pow(2).reduce(ee.Reducer.sum()).sqrt();
print('Longitud de las flechas (tiene que dar ~1):',
      longitud.reduceRegion({reducer: ee.Reducer.percentile([1, 50, 99]),
                             geometry: zona, scale: 100, maxPixels: 1e9}));

// =========================================================================
// 2. EL MAPA DE PARECIDO
// =========================================================================

/**
 * Devuelve el mapa de parecido de toda la zona con el píxel de `punto`.
 * Tres pasos: coger el vector del punto, multiplicarlo por la imagen, sumar.
 */
function parecidoA(punto) {
  var v = emb.reduceRegion({reducer: ee.Reducer.first(), geometry: punto, scale: 10});
  var vector = ee.Image.constant(v.toArray().toList());  // la flecha del punto: 64 números
  return emb.multiply(vector)                            // multiplica uno a uno...
            .reduce(ee.Reducer.sum())                    // ...y suma: ahí está el parecido
            .rename('parecido');
}

var visParecido = {min: 0, max: 1,
                   palette: ['2b2b2b', '5b3a8c', 'b03a6e', 'ed7541', 'f7e36b']};

// =========================================================================
// 3. CUATRO OBJETIVOS, CUATRO MAPAS
// =========================================================================

var objetivos = {
  'Marisma inundada': ee.Geometry.Point([-6.345, 36.955]),
  'Pinar':            ee.Geometry.Point([-6.470, 37.015]),
  'Arrozal':          ee.Geometry.Point([-6.230, 37.060]),
  'Duna móvil':       ee.Geometry.Point([-6.470, 36.900])
};

Object.keys(objetivos).forEach(function (nombre) {
  var punto = objetivos[nombre];
  var sim = parecidoA(punto);
  Map.addLayer(sim, visParecido, 'Parecido a: ' + nombre, nombre === 'Marisma inundada');
  Map.addLayer(ee.FeatureCollection([ee.Feature(punto)]).style({color: 'white', pointSize: 6}),
               {}, 'Punto: ' + nombre, false);
  print('Parecido a ' + nombre + ' (p1 / mediana / p99):',
        sim.reduceRegion({reducer: ee.Reducer.percentile([1, 50, 99]),
                          geometry: zona, scale: 100, maxPixels: 1e9}));
});

/*
 * Mira los cuatro mapas con el Inspector y fíjate en una cosa: **no has
 * entrenado nada**. No hay muestras, ni clasificador, ni matriz de confusión.
 * Has señalado un píxel y el mapa te ha enseñado dónde hay más de lo mismo.
 */

// =========================================================================
// 4. EL MISMO SITIO, OCHO AÑOS DESPUÉS
// =========================================================================

/*
 * Como hay un embedding por año, el parecido entre el MISMO píxel en dos años
 * distintos mide cuánto ha cambiado ese sitio. Cerca de 1, sigue igual; bajo,
 * ha pasado algo.
 */
function embDe(y) {
  return EMB.filterDate(y + '-01-01', (y + 1) + '-01-01').filterBounds(zona).mosaic().clip(zona);
}

var cambio = embDe(2017).multiply(embDe(2024)).reduce(ee.Reducer.sum()).rename('estabilidad');
Map.addLayer(cambio, {min: 0.3, max: 1,
             palette: ['b2182b', 'ef8a62', 'fddbc7', 'd1e5f0', '67a9cf', '2166ac']},
             'Estabilidad 2017 → 2024 (rojo = ha cambiado)', false);

print('Estabilidad 2017→2024 (p5 / mediana / p95):',
      cambio.reduceRegion({reducer: ee.Reducer.percentile([5, 50, 95]),
                           geometry: zona, scale: 100, maxPixels: 1e9}));

// =========================================================================
// 5. DÓNDE ESTÁ EL TRUCO
// =========================================================================

/*
 * Lo que SÍ hace:
 *   - Resume un año entero de varios sensores sin que tú montes el compuesto.
 *   - Te deja buscar por parecido con un solo punto y una multiplicación.
 *   - Compara años entre sí con la misma operación.
 *
 * Lo que NO hace, y conviene tenerlo claro:
 *   - **No te dice de qué es cada sitio.** «Se parece al píxel que señalaste»
 *     no es lo mismo que «es marisma». La etiqueta la pones tú.
 *   - **Un punto es una muestra de tamaño 1.** Si lo pones en un sitio raro, el
 *     mapa sale raro. Lo robusto es promediar el embedding de varios puntos del
 *     mismo tipo, que es el ejercicio de abajo.
 *   - **No sustituye a la validación.** Un mapa bonito sigue sin tener medida
 *     de error mientras no lo compares con algo independiente.
 *   - El año es la unidad mínima: esto no ve una crecida de marzo.
 *
 * EJERCICIO
 * ---------
 * 1. Mueve los cuatro puntos a tu zona de trabajo y mira qué sale.
 * 2. Cambia `parecidoA` para que reciba una lista de puntos y use la MEDIA de
 *    sus embeddings. Vuelve a normalizar el resultado a longitud 1 antes de
 *    multiplicar, o el coseno deja de estar entre -1 y 1.
 * 3. Umbraliza el parecido (`sim.gt(0.80)`) y mide con `reduceRegion` cuántas
 *    hectáreas pasan el corte. ¿Dónde pondrías el umbral, y por qué ahí?
 * 4. Para quien quiera la segunda vuelta: con ~20 puntos etiquetados a mano y
 *    un `ee.Classifier.smileRandomForest`, las 64 bandas son las predictoras.
 *    Compara ese resultado con el mapa de parecido: ¿compensa el trabajo extra?
 */
