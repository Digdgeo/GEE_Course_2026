/**
 * Extra · Temperatura superficial del mar en Canarias: afloramiento y olas de calor
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * Fuera de programa. Está aquí porque el curso tira todo el rato de tierra
 * firme y Earth Engine también sirve para el mar, que es de donde venía
 * alguna de las preguntas del primer día.
 *
 * La idea de fondo es la misma del día 2 —una colección, un reductor, una
 * serie— aplicada a un sitio donde el océano hace algo muy visible:
 *
 *   §1  El afloramiento: por qué el agua de la costa africana está más fría.
 *   §2  Resolución contra longitud de la serie: dos sensores, dos oficios.
 *   §3  La anomalía, que es lo que de verdad se mira.
 *   §4  La ola de calor marina de 2023.
 *
 * CIFRAS DE CONTROL (medidas contra Earth Engine el 11-nov-2026):
 *   - agosto 2024, recuadro de Canarias: p5 20,84 · mediana 22,84 · p95 23,65 °C
 *   - costa africana 20,12 °C contra océano abierto al oeste 23,06 °C → ~3 °C
 *   - anomalía del verano: 2022 +0,56 · **2023 +2,11** · 2024 +0,40 · 2025 +0,81 °C
 */

// ---------------------------------------------------------------------------
// 0. La zona
// ---------------------------------------------------------------------------

// De El Hierro al banco sahariano. Entra el archipiélago entero y, a la
// derecha, la franja de costa africana donde sopla el alisio.
var canarias = ee.Geometry.Rectangle([-19.5, 26.5, -12.0, 30.0]);
Map.centerObject(canarias, 6);

// =========================================================================
// 1. EL AFLORAMIENTO, VISTO A 4,6 km
// =========================================================================

/*
 * GCOM-C («Shikisai», de la JAXA) da temperatura superficial del mar a 4,6 m
 * de resolución... de kilómetro, perdón: 4,6 km. Dos pasadas al día, diurna y
 * nocturna. Nos quedamos con la diurna, que es la que tiene menos hueco.
 *
 * OJO con las unidades: la banda viene en enteros y hay que aplicarle la
 * escala y el desplazamiento del catálogo. Si te saltas esta línea, los mapas
 * salen con valores de miles y no te enteras de nada.
 */
var SST_ESCALA = 0.0012, SST_OFFSET = -10;

var gcom = ee.ImageCollection('JAXA/GCOM-C/L3/OCEAN/SST/V3')
             .filter(ee.Filter.eq('SATELLITE_DIRECTION', 'D'))   // D = diurna
             .select('SST_AVE');

var agosto24 = gcom.filterDate('2024-08-01', '2024-09-01')
                   .mean().multiply(SST_ESCALA).add(SST_OFFSET)
                   .rename('sst').clip(canarias);

var visSST = {min: 19, max: 25,
              palette: ['2166ac', '67a9cf', 'd1e5f0', 'fddbc7', 'ef8a62', 'b2182b']};
Map.addLayer(agosto24, visSST, 'SST media, agosto 2024 (°C)');

print('SST agosto 2024, recuadro entero (p5 / mediana / p95):',
      agosto24.reduceRegion({reducer: ee.Reducer.percentile([5, 50, 95]),
                             geometry: canarias, scale: 5000, maxPixels: 1e9}));

/*
 * Mira el mapa: la lengua fría pegada a la costa africana es el **afloramiento
 * costero**, uno de los cuatro grandes del mundo (la corriente de Canarias,
 * junto con las de Benguela, Humboldt y California).
 *
 * El mecanismo, en tres pasos:
 *   1. El alisio sopla casi todo el año paralelo a la costa, de norte a sur.
 *   2. Por la rotación de la Tierra, el agua empujada por el viento no va en
 *      la dirección del viento sino desviada a la derecha: el transporte de
 *      Ekman la aparta de la costa, mar adentro.
 *   3. Ese hueco lo rellena agua que sube desde 100-200 m de profundidad. Y
 *      esa agua es **fría** —de ahí la lengua azul— y **rica en nutrientes**,
 *      porque los nitratos y fosfatos se acumulan en profundidad cuando la
 *      materia orgánica que cae desde arriba se descompone.
 *
 * Es lo que sostiene la pesquería del banco sahariano, y la razón de que las
 * cuatro zonas de afloramiento del mundo den una parte desproporcionada de la
 * pesca mundial con una fracción mínima de la superficie del océano.
 *
 * Vamos a medirlo en vez de mirarlo, que es lo que enseña este curso.
 */
var cajas = ee.FeatureCollection([
  ee.Feature(ee.Geometry.Rectangle([-13.6, 27.2, -12.6, 28.2]), {sitio: '1 costa africana'}),
  ee.Feature(ee.Geometry.Rectangle([-16.2, 27.8, -15.2, 28.8]), {sitio: '2 entre islas'}),
  ee.Feature(ee.Geometry.Rectangle([-19.0, 27.8, -18.0, 28.8]), {sitio: '3 océano abierto'})
]);
Map.addLayer(cajas.style({color: 'white', fillColor: '00000000', width: 2}), {}, 'Cajas de medida');

print('Gradiente de afloramiento, agosto 2024 (°C):',
      agosto24.reduceRegions({collection: cajas, reducer: ee.Reducer.mean(), scale: 5000})
              .select(['sitio', 'mean'], null, false));

/*
 * Y no es cosa de un mes suelto. Medido para los veranos de 2019 a 2025, la
 * caja de la costa africana sale siempre entre 2,6 y 3,2 °C por debajo de la
 * de océano abierto, y en invierno sigue 2,0 °C por debajo:
 *
 *      verano 2019  -3,17 °C      verano 2024  -2,78 °C
 *      verano 2021  -2,72 °C      verano 2025  -2,93 °C
 *      verano 2023  -2,64 °C      invierno 2025  -1,97 °C
 *
 * Cámbiale las fechas y compruébalo tú, que para eso está escrito así.
 */

// =========================================================================
// 2. RESOLUCIÓN CONTRA LONGITUD DE LA SERIE
// =========================================================================

/*
 * GCOM-C ve bien el detalle, pero empieza en 2018. Para hablar de clima hace
 * falta una serie larga, y eso lo da OISST de la NOAA: 0,25° (unos 28 km, muy
 * grueso) pero **diaria y desde septiembre de 1981**.
 *
 * Esta disyuntiva —detalle o historia, casi nunca las dos— es la decisión que
 * más condiciona un trabajo con series de satélite, y conviene tomarla a
 * conciencia y no por el dataset que uno ya conocía.
 */
var oisst = ee.ImageCollection('NOAA/CDR/OISST/V2_1');

print('OISST, primera y última fecha:',
      ee.Date(oisst.first().get('system:time_start')).format('YYYY-MM-dd'),
      ee.Date(oisst.sort('system:time_start', false).first().get('system:time_start'))
        .format('YYYY-MM-dd'));

// Caja al oeste de las islas, en agua abierta: sin costa de por medio, la
// serie es limpia.
var oeste = ee.Geometry.Rectangle([-18.5, 27.5, -15.5, 29.5]);
Map.addLayer(ee.FeatureCollection([ee.Feature(oeste)])
               .style({color: 'yellow', fillColor: '00000000', width: 2}), {}, 'Caja de la serie');

// =========================================================================
// 3. LA ANOMALÍA
// =========================================================================

/*
 * OISST trae dos bandas que conviene no confundir:
 *   `sst`  → la temperatura, en centésimas de grado (hay que multiplicar por 0,01)
 *   `anom` → la ANOMALÍA respecto a su climatología 1971-2000, ya calculada
 *
 * Y la anomalía es casi siempre lo que se quiere mirar. 23 °C en agosto no
 * dice nada por sí solo; +2 °C sobre lo normal en agosto dice muchísimo.
 */
function medioVerano(anio, banda) {
  // `anio` es un ee.Number, así que las fechas hay que construirlas en el
  // servidor con ee.Date.fromYMD. Concatenar con '+' aquí daría una cadena
  // basura: es el error clásico de mezclar cliente y servidor.
  anio = ee.Number(anio).int();
  return oisst.filterDate(ee.Date.fromYMD(anio, 7, 1), ee.Date.fromYMD(anio, 10, 1))
              .select(banda).mean().multiply(0.01)
              .reduceRegion({reducer: ee.Reducer.mean(), geometry: oeste,
                             scale: 25000, maxPixels: 1e9}).get(banda);
}

var anios = ee.List.sequence(1982, 2025);
var serie = ee.FeatureCollection(anios.map(function (y) {
  y = ee.Number(y).int();
  return ee.Feature(null, {anio: y,
                           sst: medioVerano(y, 'sst'),
                           anomalia: medioVerano(y, 'anom')});
}));

print(ui.Chart.feature.byFeature(serie, 'anio', ['anomalia'])
        .setChartType('ColumnChart')
        .setOptions({
          title: 'Anomalía de SST en verano (jul-sep), al oeste de Canarias',
          hAxis: {title: 'año'},
          vAxis: {title: 'anomalía respecto a 1971-2000 (°C)'},
          legend: {position: 'none'},
          colors: ['b2182b']
        }));

// =========================================================================
// 4. EL VERANO DE 2023
// =========================================================================

/*
 * En el gráfico de arriba hay un año que se sale: 2023, con **+2,11 °C** de
 * anomalía media en verano, frente a +0,56 en 2022 y +0,40 en 2024. Fue la ola
 * de calor marina del Atlántico Norte, y aquí la tienes medida en cuatro
 * líneas de código sobre una serie de cuarenta y cuatro años.
 */
var anomalia23 = oisst.filterDate('2023-07-01', '2023-10-01').select('anom')
                      .mean().multiply(0.01).clip(canarias);
Map.addLayer(anomalia23, {min: -2, max: 2,
             palette: ['2166ac', '67a9cf', 'f7f7f7', 'ef8a62', 'b2182b']},
             'Anomalía de SST, verano 2023 (°C)', false);

[2022, 2023, 2024, 2025].forEach(function (y) {
  print('Verano ' + y + ' → SST y anomalía (°C):', medioVerano(y, 'sst'), medioVerano(y, 'anom'));
});

/*
 * EJERCICIO
 * ---------
 * 1. Cambia la caja `oeste` por otra al SURESTE de Gran Canaria y compara la
 *    serie. El agua de sotavento de las islas se calienta: es la **estela
 *    térmica**, y con 28 km de píxel está en el límite de lo que se resuelve.
 *    Repite con GCOM-C a 4,6 km y mira si aparece.
 * 2. Cuenta cuántos días del verano de 2023 superaron el percentil 90 de su
 *    propia climatología. Esa es, a grandes rasgos, la definición operativa
 *    de ola de calor marina (Hobday et al., 2016): el umbral se calcula **para
 *    cada día del año por separado**, con una ventana de ±5 días y una
 *    referencia de 30 años, y hace falta encadenar **5 días o más** por encima
 *    para llamarlo ola de calor.
 *
 *    La respuesta, para que puedas comprobar la tuya: con la referencia
 *    1982-2011 y la caja `oeste`, el verano de 2023 da **118 días de 122 por
 *    encima del umbral, todos seguidos**, con un exceso medio de +0,94 °C y un
 *    máximo de +1,41 °C el 23 de junio.
 *
 *    Y antes de creértelo, la pregunta que hay que hacerse: ¿no estará el
 *    umbral mal, si una referencia de hace cuarenta años la supera cualquier
 *    verano de ahora? Compruébalo con otros años. Sale esto:
 *
 *      2010   0 días      2021  11 días      2023  **118 días**
 *      2019   0 días      2022   7 días      2024    6 días
 *      2015  45 días      2025  23 días
 *
 *    O sea que no: el umbral discrimina perfectamente, y 2023 está solo. Es el
 *    único de los diez años mirados cuya media de verano queda POR ENCIMA del
 *    propio percentil 90.
 * 3. Cruza la SST con la clorofila: `NASA/OCEANDATA/MODIS-Aqua/L3SMI`, banda
 *    `chlor_a`, en las mismas tres cajas. La predicción no es que la clorofila
 *    esté «más fría» —son dos magnitudes distintas— sino que **la misma caja
 *    que sale fría tiene que salir verde**: el agua que sube es fría *y* trae
 *    los nutrientes, así que las dos señales marcan el mismo sitio por la
 *    misma causa. Y se cumple de sobra, está medido:
 *
 *      verano 2023   costa 2,373 mg/m³   abierto 0,090   → ×26
 *      verano 2024   costa 5,265 mg/m³   abierto 0,107   → ×49
 *
 *    Esa es la diferencia entre un desierto oceánico y una de las zonas más
 *    productivas del planeta, y están a 400 km la una de la otra.
 */
