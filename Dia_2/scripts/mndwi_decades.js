// ============================================================================
// SCRIPT: ANÁLISIS TEMPORAL DE AGUA CON MNDWI - SERIES TEMPORALES LANDSAT
// ============================================================================
// Este script combina datos de Landsat 5, 7, 8 y 9 para calcular el índice
// MNDWI (Modified Normalized Difference Water Index) en 4 períodos de 10 años
//
// CIFRAS DE CONTROL (medidas contra Earth Engine el 11-nov-2026). Si al
// ejecutarlo te salen muy distintas, algo ha cambiado:
//   escenas con menos del 20 % de nube:  L5 533 · L7 579 · L8 283 · L9 87 = 1.482
//   escenas y agua (p98 MNDWI > 0) por década, midiendo a 300 m:
//     1984-1994   231 escenas   105.098 ha
//     1994-2004   253 escenas   109.000 ha
//     2004-2014   332 escenas   108.270 ha
//     2014-2024   656 escenas    96.837 ha
//   OJO al comparar esas cuatro cifras entre sí: cada década se calcula con un
//   número muy distinto de escenas (de 231 a 656), y el percentil 98 depende de
//   cuántas haya. La diferencia que ves no es solo del agua.
//
// ⚠️ MEDIR ÁREAS AQUÍ, CON CUIDADO. Pintar las capas en el mapa es barato,
// porque GEE calcula solo lo que cabe en pantalla. Pero un `reduceRegion` a 30 m
// sobre toda la caja y sobre un compuesto de una década entera **se cae con
// «User memory limit exceeded»** — comprobado. Si quieres cuantificar, hazlo a
// una escala más gruesa (`scale: 300`) o con `bestEffort: true`, o reduce la
// caja. Es el error con el que más gente se encuentra la primera vez.

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN INICIAL
// ----------------------------------------------------------------------------

// La zona de estudio, definida en código para que el script corra al pegarlo.
// En la versión original esto eran DOS geometrías dibujadas, `extent` y
// `region`, que hacían lo mismo: una para filtrar la colección y otra para
// recortar. Se queda una sola.
var extent = ee.Geometry.Rectangle([-6.55, 36.80, -6.05, 37.25]);  // marisma del Guadalquivir
var region = extent;

// Definir el rango temporal completo del análisis
var fechaInicio = '1984-01-01';
var fechaFin = '2023-12-31';

// Sistema de coordenadas de referencia (UTM Zone 29N para el área de estudio)
var crs = 'EPSG:32629';

// Umbral de cobertura de nubes (solo imágenes con menos del 20% de nubes)
var umbralNubes = 20;

// Escala espacial de trabajo (resolución de Landsat)
var escala = 30;

// CONFIGURACIÓN DE ANÁLISIS ESTADÍSTICO
// Opciones: 'median', 'max', 'percentile98'
var metodoEstadistico = 'percentile98';

// Umbral de MNDWI para considerar agua (valores > 0 indican presencia de agua)
var umbralAgua = 0;

// ----------------------------------------------------------------------------
// 2. FUNCIONES DE PROCESAMIENTO
// ----------------------------------------------------------------------------

/**
 * Selecciona y renombra las bandas de las diferentes colecciones de Landsat
 * Landsat 5 y 7 tienen la misma nomenclatura de bandas
 * Landsat 8 y 9 tienen nomenclatura diferente (empiezan en B2 en vez de B1)
 */
function seleccionarBandasColeccion(imagen, satelite) {
  var bandasOriginales, bandasRenombradas;
  
  // Landsat 5 y 7 comparten la misma estructura de bandas
  if (satelite === 'L5' || satelite === 'L7') {
    bandasOriginales = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
    bandasRenombradas = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
  } 
  // Landsat 8 y 9 tienen un desplazamiento en la numeración de bandas
  else {
    bandasOriginales = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'];
    bandasRenombradas = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
  }
  
  return imagen.select(bandasOriginales, bandasRenombradas);
}

/**
 * Aplica los coeficientes de calibración para convertir valores digitales
 * a reflectancia de superficie según documentación de Landsat Collection 2
 *
 * ESTE PASO NO ES OPCIONAL, Y ES LA TRAMPA DE TODO EL SCRIPT. Uno piensa: «el
 * MNDWI es un cociente normalizado, el factor de escala se cancela, puedo
 * calcularlo sobre los enteros». El factor sí se cancela. **El offset de −0.2
 * no**, porque sobrevive en el denominador:
 *
 *   sin escalar:  (G − S) / (G + S)
 *   escalado:     (G − S) / (G + S − 14545)
 *
 * Son dos números distintos, los dos entre −1 y 1, los dos con pinta de MNDWI,
 * y ninguna función se queja. Si el umbral de agua se calibró con uno y se
 * aplica al otro, el agua sale donde no está.
 */
function aplicarCoeficientesReflectividad(imagen) {
  return imagen.multiply(0.0000275).add(-0.2)
    .copyProperties(imagen, imagen.propertyNames());
}

/**
 * Calcula el índice MNDWI (Modified Normalized Difference Water Index)
 * MNDWI = (Green - SWIR1) / (Green + SWIR1)
 * Valores positivos indican presencia de agua
 */
function calcularMNDWI(imagen) {
  var mndwi = imagen.normalizedDifference(['green', 'swir1'])
    .rename('MNDWI');
  
  // Recortar al área de estudio. Y NADA MÁS.
  //
  // Aquí había un `.reproject({crs: crs, scale: escala})`, y se ha quitado a
  // propósito. `reproject()` dentro de una función que se mapea sobre la
  // colección obliga a Earth Engine a calcular en esa proyección y a esa escala
  // en todas partes, al zoom que sea: se pierde la pirámide de resoluciones,
  // que es justo lo que hace rápido a GEE. El mapa pasa de segundos a minutos,
  // o da «User memory limit exceeded» con los mismos datos.
  //
  // El CRS y la escala se fijan EN LA EXPORTACIÓN, donde `crs` y `escala` se
  // siguen usando. Ahí sí.
  // `copyProperties` para no perder la fecha. Hoy no hace falta, porque las
  // décadas se filtran ANTES de llamar a esta función, pero si algún día se
  // invierte ese orden —filtrar la colección de MNDWI por fecha— sin esta línea
  // saldrían colecciones vacías y sin ningún error que lo avise.
  return mndwi.clip(extent).select('MNDWI')
              .copyProperties(imagen, ['system:time_start']);
}

/**
 * Aplica una máscara para mostrar solo valores de MNDWI que indican agua
 * Enmascara todos los valores menores o iguales al umbral definido
 */
function enmascararAgua(imagen) {
  var mascara = imagen.gt(umbralAgua);
  return imagen.updateMask(mascara);
}

/**
 * Aplica el método estadístico seleccionado a una colección de imágenes
 * @param {ee.ImageCollection} coleccion - Colección de imágenes MNDWI
 * @returns {ee.Image} - Imagen resultante según el método estadístico
 */
function aplicarMetodoEstadistico(coleccion) {
  var resultado;
  
  if (metodoEstadistico === 'max') {
    // Máximo: útil para identificar la máxima extensión de agua
    resultado = coleccion.max();
    print('Método aplicado: MÁXIMO');
  } 
  else if (metodoEstadistico === 'percentile98') {
    // Percentil 98: quita los valores extremos pero mantiene los altos, que es
    // lo que interesa cuando se busca la máxima extensión de agua sin que la
    // decida un solo píxel raro.
    resultado = coleccion.reduce(ee.Reducer.percentile([98]))
      .rename('MNDWI');
    print('Método aplicado: PERCENTIL 98');
  } 
  else {
    // Mediana (por defecto): valor central, robusto ante outliers
    resultado = coleccion.median();
    print('Método aplicado: MEDIANA');
  }
  
  return resultado;
}

// ----------------------------------------------------------------------------
// 3. CARGA Y PROCESAMIENTO DE COLECCIONES LANDSAT
// ----------------------------------------------------------------------------

// Cargar Landsat 5 (1984-2012)
var landsat5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
  .filterDate(fechaInicio, fechaFin)
  .filterBounds(region)
  .filter(ee.Filter.lt('CLOUD_COVER', umbralNubes))
  .map(function(img) { 
    return seleccionarBandasColeccion(img, 'L5').clip(extent); 
  });

// Cargar Landsat 7 (1999-presente)
var landsat7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
  .filterDate(fechaInicio, fechaFin)
  .filterBounds(region)
  .filter(ee.Filter.lt('CLOUD_COVER', umbralNubes))
  .map(function(img) { 
    return seleccionarBandasColeccion(img, 'L7').clip(extent); 
  });

// Cargar Landsat 8 (2013-presente)
var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterDate(fechaInicio, fechaFin)
  .filterBounds(region)
  .filter(ee.Filter.lt('CLOUD_COVER', umbralNubes))
  .map(function(img) { 
    return seleccionarBandasColeccion(img, 'L8').clip(extent); 
  });

// Cargar Landsat 9 (2021-presente)
var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterDate(fechaInicio, fechaFin)
  .filterBounds(region)
  .filter(ee.Filter.lt('CLOUD_COVER', umbralNubes))
  .map(function(img) { 
    return seleccionarBandasColeccion(img, 'L9').clip(extent); 
  });

// Combinar todas las colecciones en una serie temporal unificada
var landsatCombinado = landsat5.merge(landsat7).merge(landsat8).merge(landsat9);

print("Colección combinada Landsat:", landsatCombinado);

// Aplicar conversión a reflectancia de superficie
var landsatCombinadoReflectividad = landsatCombinado.map(aplicarCoeficientesReflectividad);

// ----------------------------------------------------------------------------
// 4. DIVISIÓN EN PERÍODOS DECADALES (10 AÑOS)
// ----------------------------------------------------------------------------
// Períodos hidrológicos: del 1 de septiembre al 31 de agosto

var periodo_1984_1994 = landsatCombinadoReflectividad
  .filterDate('1984-09-01', '1994-08-31');
  
var periodo_1994_2004 = landsatCombinadoReflectividad
  .filterDate('1994-09-01', '2004-08-31');
  
var periodo_2004_2014 = landsatCombinadoReflectividad
  .filterDate('2004-09-01', '2014-08-31');
  
var periodo_2014_2024 = landsatCombinadoReflectividad
  .filterDate('2014-09-01', '2024-08-31');

// ----------------------------------------------------------------------------
// 5. CÁLCULO DE MNDWI PARA CADA PERÍODO
// ----------------------------------------------------------------------------
// Primero se calcula el MNDWI para cada imagen del período
// Luego se aplica el método estadístico seleccionado (median, max o percentile95)
// Finalmente se enmascara para mostrar solo valores que indican agua (> 0)

var mndwi_1984_1994 = aplicarMetodoEstadistico(periodo_1984_1994.map(calcularMNDWI));
var mndwi_1994_2004 = aplicarMetodoEstadistico(periodo_1994_2004.map(calcularMNDWI));
var mndwi_2004_2014 = aplicarMetodoEstadistico(periodo_2004_2014.map(calcularMNDWI));
var mndwi_2014_2024 = aplicarMetodoEstadistico(periodo_2014_2024.map(calcularMNDWI));

// Aplicar máscara de agua (solo valores > 0)
var mndwi_1984_1994_masked = enmascararAgua(mndwi_1984_1994);
var mndwi_1994_2004_masked = enmascararAgua(mndwi_1994_2004);
var mndwi_2004_2014_masked = enmascararAgua(mndwi_2004_2014);
var mndwi_2014_2024_masked = enmascararAgua(mndwi_2014_2024);

// ----------------------------------------------------------------------------
// 6. VISUALIZACIÓN EN EL MAPA
// ----------------------------------------------------------------------------

// Centrar el mapa en el área de estudio
Map.centerObject(extent, 10);

// Paleta de colores: azul claro a azul oscuro (solo para agua)
var paletaAgua = ['lightblue', 'blue', 'darkblue'];

// Añadir capas enmascaradas al mapa (solo se muestra agua)
Map.addLayer(mndwi_1984_1994_masked, {min: 0, max: 1, palette: paletaAgua}, 
  'MNDWI 1984-1994 (solo agua)');
Map.addLayer(mndwi_1994_2004_masked, {min: 0, max: 1, palette: paletaAgua}, 
  'MNDWI 1994-2004 (solo agua)', false);
Map.addLayer(mndwi_2004_2014_masked, {min: 0, max: 1, palette: paletaAgua}, 
  'MNDWI 2004-2014 (solo agua)', false);
Map.addLayer(mndwi_2014_2024_masked, {min: 0, max: 1, palette: paletaAgua}, 
  'MNDWI 2014-2024 (solo agua)', false);

// ----------------------------------------------------------------------------
// 7. EXPORTACIÓN DE RESULTADOS
// ----------------------------------------------------------------------------

// Definir parámetros comunes de exportación
var parametrosExportacion = {
  region: extent,
  scale: escala,
  crs: crs,
  maxPixels: 1e13
};

// Exportar cada período como un asset (versión enmascarada)
Export.image.toAsset({
  image: mndwi_1984_1994_masked,
  description: 'MNDWI_1984_1994_' + metodoEstadistico + '_masked',
  assetId: 'users/ee-digdgeografo/MNDWI_1984_1994_' + metodoEstadistico + '_masked',
  region: parametrosExportacion.region,
  scale: parametrosExportacion.scale,
  crs: parametrosExportacion.crs,
  maxPixels: parametrosExportacion.maxPixels
});

Export.image.toAsset({
  image: mndwi_1994_2004_masked,
  description: 'MNDWI_1994_2004_' + metodoEstadistico + '_masked',
  assetId: 'users/ee-digdgeografo/MNDWI_1994_2004_' + metodoEstadistico + '_masked',
  region: parametrosExportacion.region,
  scale: parametrosExportacion.scale,
  crs: parametrosExportacion.crs,
  maxPixels: parametrosExportacion.maxPixels
});

Export.image.toAsset({
  image: mndwi_2004_2014_masked,
  description: 'MNDWI_2004_2014_' + metodoEstadistico + '_masked',
  assetId: 'users/ee-digdgeografo/MNDWI_2004_2014_' + metodoEstadistico + '_masked',
  region: parametrosExportacion.region,
  scale: parametrosExportacion.scale,
  crs: parametrosExportacion.crs,
  maxPixels: parametrosExportacion.maxPixels
});

Export.image.toAsset({
  image: mndwi_2014_2024_masked,
  description: 'MNDWI_2014_2024_' + metodoEstadistico + '_masked',
  assetId: 'users/ee-digdgeografo/MNDWI_2014_2024_' + metodoEstadistico + '_masked',
  region: parametrosExportacion.region,
  scale: parametrosExportacion.scale,
  crs: parametrosExportacion.crs,
  maxPixels: parametrosExportacion.maxPixels
});
