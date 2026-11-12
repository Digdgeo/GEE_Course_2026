/**
 * Extra · Construcciones y luces nocturnas: limpiar los falsos positivos del GHSL
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * Fuera de programa. Viene de un script propio, y el motivo de que exista es
 * concreto: **en la costa de Doñana y en Matalascañas, la capa de edificado del
 * GHSL daba por construidos píxeles de arena**. Dunas y playa son muy
 * reflectantes, el clasificador las confunde con tejados, y aparece una ciudad
 * donde no hay nada. La idea para arreglarlo era cruzar el edificado con las
 * luces nocturnas: **lo que está construido de verdad, se ve de noche.**
 *
 *   §1  El producto nuevo: superficie construida, no una máscara.
 *   §2  Las luces: la mediana del año, y por qué la mediana.
 *   §3  Ver las luces: el estirado logarítmico, las clases y la leyenda.
 *   §4  Cuánta luz nueva hay: 2014 contra 2023.
 *   §5  El falso positivo de Matalascañas, medido.
 *   §6  El filtro: qué limpia, y qué se lleva por delante.
 *   §7  El mapa del edificado.
 *   §8  Lo que se podía hacer con el GHSL antiguo: las épocas de construcción.
 *
 * CIFRAS DE CONTROL (medidas contra Earth Engine el 12-nov-2026):
 *
 *   FRANJA DE PLAYA Y DUNAS (línea de costa de Matalascañas a la desembocadura,
 *   500 m de buffer, 2.723 ha, sin pueblo dentro):
 *     - GHSL P2016 (el antiguo):  88,2 ha dadas por edificadas · **0 ha con luz**
 *     - GHSL P2023A (el nuevo) :  **0,0 ha** de superficie construida
 *     - y P2016 reparte esas 88 ha entre las cuatro épocas (169 / 276 / 293 / 206
 *       píxeles), que es la firma de que aquello es ruido y no una ciudad
 *
 *   CAJA DE LA COSTA (59.325 ha, de Matalascañas a la desembocadura):
 *     - superficie construida real (P2023A, suma de m²): 127,5 ha
 *     - P2016 binario: 1.275,1 ha, de ellas 818,8 ha sin luz (el 64 %)
 *     - P2023A > 1.000 m²/celda: 439,4 ha, de ellas 10,2 ha sin luz (el 2 %)
 *
 *   CAJA DE SEVILLA (294.868 ha), para contrastar con una ciudad de verdad:
 *     - superficie construida real: 8.781,6 ha
 *     - P2023A > 1.000 m²/celda: 26.726,5 ha · sin luz 869,2 ha
 *     - P2023A > 2.500 m²/celda: 14.328,6 ha · sin luz 115,9 ha
 *     - iluminado (mediana 2023 > 2 nW): 117.171 ha
 *
 *   LAS LUCES, en Andalucía occidental (3.304.598 ha, la caja del §3):
 *     - radiancia medida en 2023, nW/cm²/sr: Atlántico 0,35 · Sierra Morena 0,445
 *       · marisma de Doñana 0,45 · Matalascañas 35,3 · invernaderos de El Ejido
 *       62,1 · centro de Sevilla 67,6 · máximo de la caja 217,5
 *     - ha por clase: < 0,5 → 1.590.188 · 0,5-2 → 1.406.834 · 2-10 → 207.717
 *       · 10-30 → 61.085 · 30-60 → 22.592 · > 60 → 17.624
 *     - o sea: solo el 9,4 % del territorio pasa de 2 nW, y el 0,53 % de 60
 *     - iluminado (> 2 nW): 261.822 ha en 2014 y 309.018 ha en 2023 → luz nueva
 *       65.672 ha, luz perdida 18.476 ha
 *     - en la caja de Sevilla, de 2014 a 2023 la mediana sube (0,569 → 1,377) y
 *       el percentil 99 baja (113,5 → 95,5)
 *
 *   VIIRS mensual: 153 imágenes, de enero de 2014 a septiembre de 2026, 463,8 m
 *   de píxel. GHSL P2023A: 100 m. GHSL P2016: 38,2 m.
 */

// ---------------------------------------------------------------------------
// 0. Las fuentes y las zonas
// ---------------------------------------------------------------------------

// La zona del problema: la costa de Doñana, de Matalascañas a la desembocadura
// del Guadalquivir.
var costa = ee.Geometry.Rectangle([-6.60, 36.78, -6.35, 37.02]);

// Y dentro de ella, solo la playa y el cordón dunar: la línea de costa con 500 m
// de buffer, dejando el pueblo fuera. Aquí la respuesta correcta se sabe de
// antemano —no hay nada construido—, y eso es lo que la convierte en una prueba.
var franjaPlaya = ee.Geometry.LineString([
  [-6.552, 36.987], [-6.47, 36.90], [-6.41, 36.84], [-6.385, 36.792]
]).buffer(500);

// Una ciudad de verdad, para contrastar.
var sevilla = ee.Geometry.Rectangle([-6.30, 37.10, -5.70, 37.60]);

// Y Andalucía occidental entera, que es la escala a la que las luces se ven
// bien: entran Sevilla, Huelva, Cádiz, Jerez y el campo que hay entre ellas.
var occidental = ee.Geometry.Rectangle([-7.60, 36.60, -5.20, 38.00]);

/*
 * GHSL (Global Human Settlement Layer, del JRC de la Comisión Europea).
 * Se usa la versión **P2023A**, que es la vigente. La anterior, P2016, está
 * deprecada en el catálogo: sigue sirviéndose y Earth Engine avisa al
 * ejecutarla. En el §8 está lo que se podía hacer con ella y aquí ya no.
 *
 * `GHS_BUILT_S` es una colección por épocas de cinco años, de 1975 a 2030
 * (2025 y 2030 son proyección, no observación). Nos quedamos con 2020.
 */
var ghsl = ee.Image(
  ee.ImageCollection('JRC/GHSL/P2023A/GHS_BUILT_S')
    .filter(ee.Filter.eq('system:index', '2020')).first()
);
var superficie = ghsl.select('built_surface');          // m² construidos por celda de 100 m
var noResidencial = ghsl.select('built_surface_nres');  // de esos, los no residenciales

// VIIRS DNB, el sensor nocturno de la NOAA. Compuestos mensuales de radiancia
// media, 464 m. VCMSLCFG es la versión *stray-light corrected*: corrige la luz
// parásita de las latitudes altas en verano y a cambio deja algún hueco.
var luces = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
  .select('avg_rad')
  .filterDate('2023-01-01', '2023-12-31');

/*
 * Fondo oscuro. Para un mapa de luces no es un adorno: sobre el mapa claro de
 * Google, una trama amarilla de poca radiancia no se distingue del fondo.
 * `Map.setOptions(nombre, {nombre: estilo})` acepta un estilo de Google Maps.
 */
Map.setOptions('Noche', {Noche: [
  {elementType: 'geometry', stylers: [{color: '#14171c'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#8a93a0'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#14171c'}]},
  {elementType: 'labels.icon', stylers: [{visibility: 'off'}]},
  {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0b0d10'}]},
  {featureType: 'road', elementType: 'geometry', stylers: [{color: '#22262e'}]},
  {featureType: 'administrative', elementType: 'geometry.stroke',
   stylers: [{color: '#2f3642'}]}
]});

Map.centerObject(occidental, 8);
// Map.centerObject(costa, 11);   // ← para ver los falsos positivos del §5

// =========================================================================
// 1. EL PRODUCTO NUEVO NO ES UNA MÁSCARA: SON METROS CUADRADOS
// =========================================================================

/*
 * Esta es la diferencia que hay que entender antes de tocar nada. El GHSL
 * antiguo decía «aquí hay edificado / aquí no». El nuevo dice **cuántos metros
 * cuadrados de construcción hay dentro de cada celda de 100 × 100 m**, de 0 a
 * 10.000. Es un dato continuo, y eso significa que **el umbral de "esto es
 * urbano" lo pones tú**, no viene en el dato.
 *
 * Y la elección pesa mucho más de lo que parece. En la caja de Sevilla, la
 * superficie realmente construida son 8.782 ha, y según dónde se corte:
 *
 *     > 0 m²/celda       62.006 ha   ← cualquier cosa, hasta un cortijo suelto
 *     > 1.000 m² (10 %)  26.727 ha   ← razonable para "mancha urbana"
 *     > 2.500 m² (25 %)  14.329 ha   ← solo tejido denso
 *     > 5.000 m² (50 %)   2.022 ha   ← prácticamente el centro histórico
 *
 * Siete veces más o menos superficie según un número que nadie te obliga a
 * justificar. Por eso el umbral va siempre escrito en la leyenda del mapa.
 */
var UMBRAL_M2 = 1000;   // 10 % de la celda. Cámbialo y vuelve a mirarlo todo.
var hayEdificado = superficie.gt(UMBRAL_M2);

// La superficie construida de verdad no se cuenta con máscaras: se suma.
print('ha construidas en la costa (suma de m²):',
  superficie.reduceRegion({
    reducer: ee.Reducer.sum(), geometry: costa, scale: 100, maxPixels: 1e10
  }).getNumber('built_surface').divide(1e4));     // 127,5

// =========================================================================
// 2. LAS LUCES: LA MEDIANA DEL AÑO
// =========================================================================

/*
 * Doce compuestos mensuales hay que reducirlos a uno, y la mediana es la
 * decisión buena, no un detalle: un incendio, una feria o un barco con focos
 * iluminan un mes y no el resto. La media y la suma se los comen; la mediana
 * los ignora. Es el argumento del percentil del script de MNDWI del día 2,
 * puesto del revés: allí interesaba el extremo, aquí lo típico.
 *
 * OJO al nombre de la banda, que es un tropiezo clásico:
 *   luces.median()                      → banda 'avg_rad'
 *   luces.reduce(ee.Reducer.median())   → banda 'avg_rad_median'
 * Calculan lo mismo. La segunda renombra, y cualquier cosa que busque
 * 'avg_rad' por su nombre deja de encontrarla.
 */
var lucesMedianas = luces.median();

// Umbral de «iluminado». 2 nW/cm²/sr deja fuera el fondo rural y se queda con
// núcleos, polígonos, autovías y puertos.
var UMBRAL_LUZ = 2;
var hayLuz = lucesMedianas.gt(UMBRAL_LUZ);

// =========================================================================
// 3. VER LAS LUCES: EL ESTIRADO, LAS CLASES Y LA LEYENDA
// =========================================================================

/*
 * Las luces nocturnas son el ejemplo perfecto de un dato que **no se puede
 * pintar con un min/max lineal**. Esto es lo que mide el sensor en 2023, en
 * nW/cm²/sr, en sitios conocidos:
 *
 *     Atlántico, mar abierto        0,35
 *     Sierra Morena, campo          0,445
 *     marisma de Doñana             0,45
 *     Matalascañas                 35,3
 *     invernaderos de El Ejido     62,1     ← tanto como una capital
 *     centro de Sevilla            67,6
 *     máximo de la caja           217,5
 *
 * Tres órdenes de magnitud. Con `{min: 0, max: 60}`, Sevilla y El Ejido saturan
 * los dos en blanco —no se distinguen— y todo lo demás, que es el 90 % del
 * territorio, se va a un negro plano. El histograma está pegado al cero: la
 * mitad de la caja no llega a 0,5.
 *
 * Y un detalle que importa para poner umbrales: **el fondo no es cero**. El mar
 * abierto da 0,35 y el campo 0,445, que es luz difusa, luna y ruido del sensor.
 * Un umbral de 0 no separa nada.
 */

// --- 3a. El estirado logarítmico -------------------------------------------

/*
 * Lo que hace legible una magnitud así es el logaritmo: cada paso de color pasa
 * a ser un factor, no una cantidad. `log10()` de 0,35 es -0,46 y de 217 es 2,34,
 * así que el rango del estirado va de -1 a 2,4.
 *
 * El `.max(0.05)` de delante es un seguro: VIIRS tiene píxeles de valor negativo
 * (la corrección de fondo se pasa de frenada) y el logaritmo de un número
 * negativo no existe, así que esos píxeles saldrían enmascarados y el mapa
 * tendría agujeros. En esta caja no hay ninguno —el mínimo medido es 0,29—, pero
 * en cuanto se mueve a otra zona aparecen.
 */
var lucesLog = lucesMedianas.max(0.05).log10();

Map.addLayer(lucesLog, {min: -1, max: 2.4,
  palette: ['#14171c', '#8a4e0c', '#b3660f', '#d98c1c', '#f2b84a', '#ffe2a0']},
  'luces · estirado logarítmico');

// --- 3b. Las clases --------------------------------------------------------

/*
 * Para clasificar hay un idioma que conviene conocer, porque evita una cadena de
 * `.where()` y se lee de un tirón: **sumar las comparaciones**. Cada `gt()`
 * devuelve 0 o 1, así que la suma de los cinco cortes da directamente la clase,
 * de 0 a 5. Un píxel de 40 nW cumple cuatro condiciones → clase 4.
 *
 * (La alternativa con `.where()` en cadena está en `extras/ndvi_zonas_mde.js`,
 * y para reclasificar categorías sueltas es la buena. Para cortes ordenados,
 * esta es más corta y no se puede equivocar el orden.)
 */
var CORTES = [0.5, 2, 10, 30, 60];
var clases = lucesMedianas.gt(CORTES[0])
  .add(lucesMedianas.gt(CORTES[1]))
  .add(lucesMedianas.gt(CORTES[2]))
  .add(lucesMedianas.gt(CORTES[3]))
  .add(lucesMedianas.gt(CORTES[4]))
  .rename('clase');

// La clase 0 se deja transparente a propósito: es «aquí no hay luz», y pintarla
// taparía el mapa de fondo sin añadir nada.
var PALETA_LUCES = ['#8a4e0c', '#b3660f', '#d98c1c', '#f2b84a', '#ffe2a0'];
Map.addLayer(clases.selfMask(), {min: 1, max: 5, palette: PALETA_LUCES},
  'luces · 5 clases');

/*
 * Cuánto territorio cae en cada clase, en Andalucía occidental (3.304.598 ha):
 *
 *     clase 0  < 0,5 nW      1.590.188 ha   48,1 %   oscuridad y mar
 *     clase 1  0,5 - 2       1.406.834 ha   42,6 %   fondo rural
 *     clase 2  2 - 10          207.717 ha    6,3 %   pueblos, carreteras
 *     clase 3  10 - 30          61.085 ha    1,8 %   ciudades medias
 *     clase 4  30 - 60          22.592 ha    0,7 %   tejido urbano denso
 *     clase 5  > 60             17.624 ha    0,5 %   puertos, polígonos, invernaderos
 *
 * Lo que enseña la tabla: **el 9,4 % del territorio pasa de 2 nW y el 0,5 % pasa
 * de 60**. Cualquier escala de color repartida a partes iguales le dedica la
 * mitad de los colores a algo que ocupa el 0,5 % del mapa. De ahí el logaritmo.
 */
/*
 * Y así se miden de una sola vez, con el **reductor agrupado**: una imagen de
 * dos bandas —el área de cada píxel y la clase— y un `sum()` agrupado por la
 * segunda. Devuelve una lista con las seis clases y sus hectáreas.
 */
print('ha por clase de luz (Andalucía occidental):',
  ee.Image.pixelArea().divide(1e4).addBands(clases)
    .reduceRegion({
      reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'clase'}),
      geometry: occidental, scale: 500, maxPixels: 1e10
    }));

// --- 3c. La leyenda --------------------------------------------------------

/*
 * Earth Engine no trae leyendas: se construyen a mano con paneles. Es tedioso y
 * es imprescindible, porque un mapa de seis clases sin leyenda no dice nada.
 * El patrón es el mismo del día 3: un panel horizontal con una cajita de color
 * —un `ui.Label` vacío con `backgroundColor`— y el texto al lado.
 */
function filaLeyenda(color, texto) {
  var caja = ui.Label('', {
    backgroundColor: color,
    padding: '8px',
    margin: '0 6px 3px 0',
    border: '1px solid #555'
  });
  return ui.Panel({
    widgets: [caja, ui.Label(texto, {fontSize: '11px', margin: '3px 0',
                                     color: '#eeeeee', backgroundColor: 'rgba(0,0,0,0)'})],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {backgroundColor: 'rgba(0,0,0,0)'}
  });
}

var leyenda = ui.Panel({
  style: {position: 'bottom-left', padding: '8px', backgroundColor: 'rgba(20,23,28,0.88)'}
});
leyenda.add(ui.Label('Luces nocturnas 2023', {
  fontSize: '13px', fontWeight: 'bold', color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0)', margin: '0 0 6px 0'
}));
leyenda.add(filaLeyenda(PALETA_LUCES[4], 'más de 60 nW · puertos, invernaderos'));
leyenda.add(filaLeyenda(PALETA_LUCES[3], '30 - 60 · tejido urbano denso'));
leyenda.add(filaLeyenda(PALETA_LUCES[2], '10 - 30 · ciudades medias'));
leyenda.add(filaLeyenda(PALETA_LUCES[1], '2 - 10 · pueblos y carreteras'));
leyenda.add(filaLeyenda(PALETA_LUCES[0], '0,5 - 2 · fondo rural'));
leyenda.add(ui.Label('nW/cm²/sr · mediana de los 12 meses', {
  fontSize: '10px', color: '#8a93a0', backgroundColor: 'rgba(0,0,0,0)',
  margin: '6px 0 0 0'
}));
Map.add(leyenda);

// =========================================================================
// 4. CUÁNTA LUZ NUEVA HAY: 2014 CONTRA 2023
// =========================================================================

/*
 * La colección llega a septiembre de 2026 y empieza en enero de 2014: 153
 * compuestos mensuales. Con dos medianas anuales y el mismo umbral se ve el
 * crecimiento, que es lo que se usa como indicador indirecto de actividad
 * económica cuando no hay estadística fiable.
 *
 * En Andalucía occidental, con el umbral de 2 nW:
 *
 *     iluminado en 2014   261.822 ha
 *     iluminado en 2023   309.018 ha   (+18 %)
 *     luz nueva            65.672 ha
 *     luz perdida          18.476 ha
 *
 * Y un matiz que conviene contar en clase, porque es contraintuitivo: en la caja
 * de Sevilla, de 2014 a 2023 **la mediana sube** (0,569 → 1,377 nW) **y el
 * percentil 99 baja** (113,5 → 95,5). O sea que hay más superficie iluminada y
 * los sitios más brillantes brillan menos. La explicación más aceptada es el
 * **cambio a LED**: el sensor DNB es casi ciego al azul, y la luz blanca de LED
 * tiene mucho azul, así que el mismo alumbrado mide menos radiancia que cuando
 * era de vapor de sodio. **Es una hipótesis razonable, no algo que este script
 * demuestre.** Pero sirve para la moraleja: una serie temporal de satélite mide
 * lo que el sensor ve, y lo que el sensor ve puede cambiar sin que cambie el
 * mundo.
 */
var luces2014 = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
  .select('avg_rad').filterDate('2014-01-01', '2014-12-31').median();

var iluminado2014 = luces2014.gt(UMBRAL_LUZ);
var iluminado2023 = hayLuz;

var luzNueva   = iluminado2023.and(iluminado2014.not()).selfMask();
var luzPerdida = iluminado2014.and(iluminado2023.not()).selfMask();

Map.addLayer(luzNueva, {palette: ['#2bb673']}, 'luz NUEVA 2014→2023', false);
Map.addLayer(luzPerdida, {palette: ['#cf3b3b']}, 'luz PERDIDA 2014→2023', false);

// =========================================================================
// 5. EL FALSO POSITIVO DE MATALASCAÑAS, MEDIDO
// =========================================================================

/*
 * La franja de playa y dunas son 2.723 ha donde no hay absolutamente nada
 * construido. Lo que decía cada producto:
 *
 *   GHSL P2016 (antiguo):  88,2 ha de edificado · y 0 ha con luz nocturna
 *   GHSL P2023A (nuevo) :   0,0 ha de superficie construida
 *
 * Dos conclusiones, y la segunda es la importante:
 *
 * 1. El cruce con las luces **detectaba bien el problema**: de las 88 ha que
 *    el producto antiguo daba por construidas, ni una sola se ve de noche.
 *    Arena, no tejados.
 *
 * 2. Pero el arreglo de verdad no era el filtro, era **cambiar de producto**.
 *    P2023A no comete el error: en esa franja da cero. Antes de montar una
 *    corrección sobre un dato, merece la pena comprobar si el dato ya está
 *    corregido río arriba.
 *
 * Y un detalle que delata el ruido: P2016 no solo inventaba edificado, además
 * le asignaba época, y la repartía entre las cuatro clases casi por igual
 * (169 / 276 / 293 / 206 píxeles). La arena no se urbanizó en 1975.
 */
var p2016 = ee.Image('JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1').select('built');
var edificado2016 = p2016.gt(2);     // en el §8 está qué significa ese 2

function hectareas(mascara, geom, escala) {
  return mascara.multiply(ee.Image.pixelArea()).divide(1e4)
    .reduceRegion({
      reducer: ee.Reducer.sum(), geometry: geom,
      scale: escala || 100, maxPixels: 1e10
    });
}

print('FRANJA DE PLAYA · P2016 dice (ha):', hectareas(edificado2016, franjaPlaya));        // 88,2
print('FRANJA DE PLAYA · P2016 y con luz:', hectareas(edificado2016.and(hayLuz), franjaPlaya)); // 0
print('FRANJA DE PLAYA · P2023A dice (ha):', hectareas(superficie.gt(0), franjaPlaya));    // 1,0
print('FRANJA DE PLAYA · P2023A > umbral:', hectareas(hayEdificado, franjaPlaya));         // 0,0

// =========================================================================
// 6. EL FILTRO: QUÉ LIMPIA Y QUÉ SE LLEVA POR DELANTE
// =========================================================================

/*
 * El filtro es una línea: quédate con el edificado que además se ve de noche.
 *
 *   .mask(m)        SUSTITUYE la máscara por m. Lo que hubiera antes, se tira.
 *   .updateMask(m)  MULTIPLICA: sobrevive lo que estaba válido Y cumple m.
 *
 * El script original usaba `mask()`, que está deprecado. Aquí las dos dan el
 * mismo resultado, porque la mediana de las luces no trae máscara previa, pero
 * el día que arriba haya un filtro de nubes `mask()` lo borra sin avisar.
 */
var edificadoLimpio = hayEdificado.updateMask(hayLuz);

// `selfMask()` quita los ceros de la propia imagen: sin él, la capa vale 0
// donde la condición no se cumple y el 0 se pinta igual, como un manchón.
var edificadoLimpioVis = edificadoLimpio.selfMask();

// Lo que el filtro descarta, que es lo que hay que mirar antes de fiarse:
var sospechoso = hayEdificado.and(hayLuz.not()).selfMask();

print('COSTA · edificado > umbral (ha):', hectareas(hayEdificado, costa));                 // 439,4
print('COSTA · de ellas, sin luz (ha):', hectareas(hayEdificado.and(hayLuz.not()), costa));// 10,2
print('SEVILLA · edificado > umbral (ha):', hectareas(hayEdificado, sevilla));             // 26.726,5
print('SEVILLA · de ellas, sin luz (ha):', hectareas(hayEdificado.and(hayLuz.not()), sevilla)); // 869,2

/*
 * LO QUE DICEN ESAS CIFRAS:
 *
 * En la costa, poner un umbral razonable ya hace casi todo el trabajo: lo
 * sospechoso baja de 818,8 ha (P2016 sin luz) a 10,2 ha. El filtro de luces
 * pasa de ser la solución a ser el último cedazo.
 *
 * Y en Sevilla, el filtro borra 869 ha de edificado que **sí existe**: naves
 * aisladas, urbanizaciones vacías, polígonos sin alumbrado nocturno. O sea que
 * el filtro cambia falsos positivos por falsos negativos. Para un mapa de la
 * costa de Doñana, donde lo que sobra es arena, compensa. Para un inventario
 * urbano, no.
 *
 * Esa es la lección del script: un filtro no se juzga por lo que quita, sino
 * por lo que quita de más.
 */

// =========================================================================
// 7. EL MAPA DEL EDIFICADO
// =========================================================================

/*
 * El script original tenía dos `Map.setCenter()`, uno sobre Milán y otro sobre
 * África a escala continental. **Solo manda el último**: el primero se ejecuta
 * y se deshace al instante, cosa que desconcierta bastante la primera vez.
 */
// Map.setCenter(8.9957, 45.5718, 12);   // Milán, el GHSL en una ciudad compacta
// Map.setCenter(20.1056, 20, 3);        // África entera, las luces a escala continental

Map.addLayer(franjaPlaya, {color: 'white'}, 'franja de playa y dunas', false);

Map.addLayer(superficie.updateMask(superficie.gt(0)),
  {min: 0, max: 5000, palette: ['#ffffcc', '#fd8d3c', '#bd0026']},
  'P2023A · m² construidos por celda');

Map.addLayer(edificado2016.selfMask(), {palette: ['#6a51a3']},
  'P2016 · edificado (con los falsos positivos de la playa)', false);

Map.addLayer(hayLuz.selfMask(), {palette: ['#fee391']},
  'iluminado (> 2 nW)', false);

Map.addLayer(edificadoLimpioVis, {palette: ['#1a9850']},
  'edificado CON luz  ← la capa limpia');

Map.addLayer(sospechoso, {palette: ['#d73027']},
  'edificado SIN luz  ← revisar esto', false);

/*
 * PARA PROBAR
 *
 * 1. Enciende a la vez «P2016 · edificado» y la franja de playa, y vete a
 *    Matalascañas: las manchas moradas sobre la arena son el problema entero.
 * 2. Mueve `UMBRAL_M2` a 0 y a 2500 y vuelve a leer las cifras del §6. ¿Cuánto
 *    de lo que llamábamos "falso positivo" era en realidad un umbral mal puesto?
 * 3. Cambia `UMBRAL_LUZ` de 2 a 1 nW y mira cuántas de las 869 ha de Sevilla
 *    dejan de ser sospechosas. El filtro es tan bueno como su umbral.
 * 4. Usa `built_surface_nres` (lo no residencial) y mira si el edificado sin
 *    luz es sobre todo industrial, que es la hipótesis razonable.
 * 5. Repite el §5 con la época 1975 de `GHS_BUILT_S` en vez de 2020: ¿había
 *    algo en Matalascañas antes de que se urbanizara?
 */

// =========================================================================
// 8. LO QUE SE PODÍA HACER CON EL GHSL ANTIGUO: LAS ÉPOCAS
// =========================================================================

/*
 * P2016 está deprecado, pero tenía una cosa que P2023A no da igual de directa:
 * su banda 'built' no era binaria sino **categórica por época de construcción**,
 * así que un solo mapa contaba cuándo se construyó cada sitio.
 *
 *   1 = agua
 *   2 = suelo sin edificar
 *   3 = edificado entre 2000 y 2014
 *   4 = edificado entre 1990 y 2000
 *   5 = edificado entre 1975 y 1990
 *   6 = edificado antes de 1975
 *
 * De ahí el `.gt(2)` que aparece en todos los ejemplos de ese dataset: «todo lo
 * edificado, de cualquier época». Y de ahí que el orden sea contraintuitivo:
 * **a más valor, más antiguo**. Un mapa de 'built' con una paleta de menos a
 * más no es «más ciudad», es «más vieja».
 *
 * El equivalente en P2023A existe, pero hay que montárselo: son doce imágenes
 * de la colección `GHS_BUILT_S`, una cada cinco años, y la época de
 * construcción es la primera en la que la celda pasa de cero. Más trabajo, y a
 * cambio superficie en vez de categoría.
 *
 * El código de las épocas, por si se quiere recuperar:
 *
 *   var p2016 = ee.Image('JRC/GHSL/P2016/BUILT_LDSMT_GLOBE_V1').select('built');
 *
 *   // qué clases hay, que es lo primero que hay que preguntarle a una banda
 *   // categórica desconocida
 *   print(p2016.reduceRegion({
 *     reducer: ee.Reducer.frequencyHistogram(),
 *     geometry: sevilla, scale: 38, maxPixels: 1e9
 *   }));
 *
 *   var antesDe1975 = p2016.eq(6);          // el casco histórico, aproximado
 *   var reciente    = p2016.eq(3);          // 2000-2014
 *
 *   Map.addLayer(p2016.updateMask(p2016.gt(2)),
 *     {min: 3, max: 6, palette: ['#fde0dd', '#fa9fb5', '#c51b8a', '#49006a']},
 *     'GHSL P2016 · edificado por época');
 *
 * En la caja de Sevilla eso daba 20.251 ha de edificado medidas a 38 m y
 * 19.796 ha medidas a 500 m: la misma capa, un 2,2 % de diferencia solo por la
 * escala a la que se mide. La escala va escrita en el resultado, o el
 * resultado no significa nada.
 */
