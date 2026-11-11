/**
 * Día 3 · App 2/4 — El selector de fechas y la capa que se actualiza
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * El script 1 tenía una fecha escrita a mano. Aquí la elige quien usa la
 * aplicación, y ese cambio trae los tres problemas de verdad de una interfaz:
 *
 *   1. ¿DE DÓNDE SALE LA LISTA DE FECHAS? Del servidor, que es quien sabe qué
 *      escenas hay. Y un `ui.Select` necesita la lista **ya**, en el cliente.
 *      Es el muro cliente/servidor, y se atraviesa con `evaluate()`.
 *   2. ¿CÓMO SE CAMBIA UNA CAPA? No con `Map.addLayer` otra vez: así se
 *      acumulan veinte capas invisibles y la aplicación se arrastra. Se
 *      sustituye con `Map.layers().set()`.
 *   3. ¿QUÉ PASA SI ESE DÍA HABÍA NUBES? Esto es lo que separa un visor bonito
 *      de un instrumento honesto, y le dedicamos el §6.
 *
 * Fíjate en que los bloques 1 y 2 son exactamente los del script 1. El
 * análisis no cambia. Nunca cambia: lo que crece es la interfaz.
 */

// ===========================================================================
// 1. CONFIGURACIÓN
// ===========================================================================

var parque = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filter(ee.Filter.eq('SITE_ID', 389012));

var ROI = parque.geometry();
var AREA_PARQUE_HA = 53327;

// El ciclo hidrológico, de octubre a octubre, que es como se mide la marisma:
// el año natural partiría la inundación en dos.
var INICIO = '2025-10-01';
var FIN    = '2026-10-01';

// Cobertura mínima para dar un número por bueno. Ver §6.
var MINIMO_VISTO = 90;

// ===========================================================================
// 2. EL ANÁLISIS
// ===========================================================================

// ---------------------------------------------------------------------------
// EL HUSO UTM: una opción que conviene entender antes de tocarla
// ---------------------------------------------------------------------------
/*
 * Doñana está pegada al meridiano de 6° W, que separa los husos UTM 29 y 30.
 * El parque entero cae al oeste (de 6,56° a 6,25° W), o sea **dentro del huso
 * 29**, pero los tiles de Sentinel-2 se solapan y los del huso 30 se estiran
 * hacia el oeste, así que la consulta devuelve **cuatro**: 29SQA y 29SQB en
 * EPSG:32629, y 30STF y 30STG en EPSG:32630.
 *
 * Y MEZCLARLOS TIENE UN COSTE QUE NO SE VE. Las dos mallas de 10 m no
 * coinciden —son dos sistemas distintos, con orígenes distintos—, así que para
 * poner un píxel del huso 30 en la malla del 29 hay que **interpolarlo**, y el
 * valor que sale no es el que midió el satélite. Como `mosaic()` no promedia
 * sino que se queda con la primera imagen que cubre cada píxel, **el resultado
 * depende del orden de la colección**, que no ha decidido nadie.
 *
 * Medido sobre el 14-feb-2026, comparando el mismo día mosaicado en un orden y
 * en el otro:
 *
 *   · el MNDWI cambia en 29.230 ha, el 54,8 % del parque
 *   · cambia más de 0,01 en el 13,2 % · más de 0,05 en el 2,2 %
 *   · y 147 ha cambian de clase: donde una versión dice agua, la otra dice seco
 *   · la superficie inundada total pasa de 27.557 a 27.596 ha según el orden
 *
 * Nada de eso es un error del dato: es el precio de remuestrear entre husos.
 * Por eso aquí se puede elegir, y por defecto se trabaja con un solo huso.
 *
 *   HUSO = 29   solo los tiles del huso 29  (lo correcto para Doñana)
 *   HUSO = 30   solo los del huso 30
 *   HUSO = 0    todos, mezclados, como venía antes
 *
 * ¿Qué se pierde con 29? Casi nada: la parte del parque que ven los tiles del
 * huso 30 y no ven los del 29 son **3 ha** de 53.327. Si cambias la zona de
 * estudio a un sitio que sí cruce el meridiano, entonces sí hay que pensarlo.
 */
var HUSO = 29;

/** Deja en la colección solo los tiles del huso elegido. HUSO = 0 no filtra. */
function soloHuso(coleccion) {
  if (!HUSO) return coleccion;
  return coleccion.filter(ee.Filter.stringStartsWith('MGRS_TILE', String(HUSO)));
}

var s2 = soloHuso(ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(ROI))
  .filterDate(INICIO, FIN);

function sinNubes(imagen) {
  var scl = imagen.select('SCL');
  var mala = scl.eq(3).or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  return imagen.updateMask(mala.not());
}

function mndwi(imagen) {
  return sinNubes(imagen)
    .divide(10000)
    .normalizedDifference(['B3', 'B11'])
    .rename('mndwi')
    .copyProperties(imagen, ['system:time_start']);
}

/*
 * Un detalle que parece menor y no lo es: **la fecha no es la escena**. La
 * marisma cae en dos pasadas de Sentinel-2, así que un mismo día puede traer
 * cuatro o seis imágenes. Si el selector ofreciera escenas sueltas, la mitad de
 * los días mediría media marisma.
 *
 * Así que el selector ofrece FECHAS, y cada fecha es el mosaico de ese día.
 */
function mosaicoDelDia(cadena) {
  var dia = ee.Date(ee.String(cadena));
  var indice = s2
    .filterDate(dia, dia.advance(1, 'day'))
    .map(mndwi)
    .mosaic()
    .select('mndwi');
  return indice.set('fecha', cadena, 'system:time_start', dia.millis());
}

// Las fechas distintas que hay en la colección, ordenadas. Esto es un
// `ee.List`: vive en el servidor.
var fechas = s2
  .aggregate_array('system:time_start')
  .map(function (t) { return ee.Date(t).format('YYYY-MM-dd'); })
  .distinct()
  .sort();

print('Fechas con escena en el ciclo:', fechas.size());

// ===========================================================================
// 3. EL MAPA Y EL PANEL
// ===========================================================================

Map.setOptions('SATELLITE');
Map.centerObject(ROI, 10);
Map.addLayer(parque.style({color: 'ffffff', fillColor: '00000000', width: 2}),
             {}, 'Parque Nacional');

/*
 * LA CAPA DE AGUA SE RESERVA SU SITIO AHORA Y SE CAMBIA DESPUÉS.
 *
 * Este es el patrón que hay que llevarse del día. `Map.layers()` es una lista
 * de capas con índices: si en cada clic haces `Map.addLayer`, añades una capa
 * nueva encima de la anterior. Diez clics, once capas, todas calculándose. La
 * aplicación no «se vuelve lenta»: la has hecho lenta tú.
 *
 * Con `set(indice, capa)` siempre hay una, y se sustituye.
 */
var CAPA_AGUA = 1;          // índice en Map.layers()
Map.layers().set(CAPA_AGUA, ui.Map.Layer(ee.Image(0).selfMask(), {}, 'Agua', false));

var panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    width: '320px',
    padding: '10px',
    position: 'top-left',
    backgroundColor: 'rgba(255, 255, 255, 0.92)'
  }
});

panel.add(ui.Label('Inundación de la marisma', {fontSize: '18px', fontWeight: 'bold'}));
panel.add(ui.Label('Ciclo ' + INICIO.slice(0, 4) + '/' + FIN.slice(2, 4) +
                   ' · Sentinel-2 · MNDWI',
                   {fontSize: '12px', color: '#666', margin: '0 0 8px 0'}));

var etiquetaArea = ui.Label('—', {fontSize: '15px', fontWeight: 'bold'});
var etiquetaVisto = ui.Label('', {fontSize: '12px', color: '#666'});
var aviso = ui.Label('', {fontSize: '12px', color: '#b33', fontWeight: 'bold', shown: false});

Map.add(panel);

// ===========================================================================
// 4. EL UMBRAL, CON UN DESLIZADOR
// ===========================================================================

/*
 * El umbral del MNDWI se enseña como «mayor que 0» y es lo correcto como punto
 * de partida, pero no es una constante de la naturaleza: depende del fondo, de
 * la vegetación emergente y de lo somera que sea la lámina. En la marisma, con
 * agua de diez centímetros sobre barro y castañuela, el 0 se queda corto unos
 * días y se pasa otros.
 *
 * Poner el umbral en la interfaz no es una floritura: es **enseñar que el
 * resultado depende de una decisión**, en vez de esconderla en el código.
 */
/*
 * OJO CON EL DESLIZADOR Y LOS DECIMALES. La primera versión de esto iba de
 * -0.3 a 0.4 con paso 0.05, que es lo natural para un MNDWI... y en pantalla
 * aparecía `5.551115123125783e-17` en lugar de `0`. No es un fallo de Earth
 * Engine: es que `-0.3 + 6*0.05` NO da 0 en coma flotante, ni en JavaScript ni
 * en Python ni en ningún sitio. Pruébalo en la consola.
 *
 * Como `ui.Slider` enseña su valor tal cual y no se le puede dar formato, la
 * solución es trabajar en centésimas, que son números enteros y por tanto
 * exactos, y dividir entre 100 al usarlo.
 */
var deslizador = ui.Slider({
  min: -30,          // centésimas de MNDWI: -0.30
  max: 40,           //                       0.40
  value: 0,
  step: 5,           //                       0.05
  style: {stretch: 'horizontal'}
});

// ===========================================================================
// 5. PINTAR Y MEDIR UNA FECHA
// ===========================================================================

var VIS_AGUA = {palette: ['#1f6feb']};

function mostrar(fechaTexto) {
  var umbral = deslizador.getValue() / 100;   // de centésimas a MNDWI

  var indice = mosaicoDelDia(fechaTexto);
  var agua = indice.gt(umbral).selfMask();

  // 1) La capa. Sustituir, no añadir.
  Map.layers().set(CAPA_AGUA,
    ui.Map.Layer(agua, VIS_AGUA, 'Agua ' + fechaTexto));

  // 2) Las dos cifras, en UNA sola llamada al servidor.
  //
  // Esto es deliberado y es la optimización más rentable del día: dos
  // `reduceRegion` son dos viajes y dos esperas. Apilando las dos bandas con
  // `ee.Image.cat` se piden las dos sumas de una vez. Mismo resultado, la
  // mitad de latencia, y el usuario no ve aparecer un número y luego el otro.
  var px = ee.Image.pixelArea();
  var sumas = ee.Image.cat(
      indice.mask().multiply(px).rename('visto'),
      agua.multiply(px).rename('agua')
    ).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ROI,
      scale: 30,
      maxPixels: 1e9
    });

  etiquetaArea.setValue('Midiendo…');
  etiquetaVisto.setValue('');
  aviso.style().set('shown', false);

  sumas.evaluate(function (r) {
    if (!r || r.agua === null || r.visto === null) {
      etiquetaArea.setValue('Sin dato para esta fecha.');
      return;
    }
    var ha = r.agua / 10000;
    var vistoHa = r.visto / 10000;
    var pctVisto = vistoHa / AREA_PARQUE_HA * 100;

    etiquetaArea.setValue(ha.toFixed(0) + ' ha inundadas  ·  ' +
                          (ha / AREA_PARQUE_HA * 100).toFixed(1) + ' % del parque');
    etiquetaVisto.setValue('Parque observado ese día: ' + pctVisto.toFixed(0) + ' %');

    // Ver §6.
    if (pctVisto < MINIMO_VISTO) {
      aviso.setValue('⚠ Solo se vio el ' + pctVisto.toFixed(0) + ' % del parque: ' +
                     'esta cifra es un mínimo, no una medida.');
      aviso.style().set('shown', true);
    }
  });
}

var selector = ui.Select({
  items: ['cargando…'],
  disabled: true,
  onChange: mostrar,
  style: {stretch: 'horizontal'}
});

panel.add(ui.Label('Fecha', {fontSize: '12px', margin: '8px 0 2px 0'}));
panel.add(selector);
panel.add(ui.Label('Umbral de MNDWI (centésimas)', {fontSize: '12px', margin: '10px 0 0 0'}));
panel.add(deslizador);
panel.add(etiquetaArea);
panel.add(etiquetaVisto);
panel.add(aviso);

// Si se mueve el umbral, se repinta la fecha que esté puesta.
deslizador.onChange(function () {
  if (selector.getValue() && !selector.getDisabled()) {
    mostrar(selector.getValue());
  }
});

/*
 * Y AQUÍ EL CRUCE DEL MURO. `fechas` es un `ee.List` del servidor; `items` de
 * un `ui.Select` tiene que ser un array de JavaScript, ahora mismo.
 *
 * `evaluate()` pide la lista y sigue sin bloquear nada. Mientras llega, el
 * selector está deshabilitado y dice «cargando…», que es lo que hay que hacer
 * siempre: una interfaz que no explica que está esperando parece una interfaz
 * rota.
 *
 * Y nota el orden: la aplicación entera **se termina de construir dentro de
 * esta función**. Es lo que desconcierta al principio y lo que hay que
 * interiorizar: en una app, lo que depende de datos del servidor se escribe
 * dentro de la vuelta.
 */
fechas.evaluate(function (lista) {
  if (!lista || lista.length === 0) {
    selector.setPlaceholder('sin escenas en el ciclo');
    return;
  }
  selector.items().reset(lista);
  selector.setDisabled(false);

  // Se arranca con una fecha que se sabe buena, no con la primera de la lista:
  // la primera es de octubre y la marisma está seca, así que la aplicación
  // abriría con un mapa en blanco y pareciendo que no funciona.
  var arranque = lista.indexOf('2026-02-14') >= 0 ? '2026-02-14' : lista[0];
  selector.setValue(arranque);   // dispara onChange y pinta
});

// ===========================================================================
// 6. LA COBERTURA: LO QUE NO SE VE NO ES AGUA QUE NO HAY
// ===========================================================================

/*
 * Pon el selector en **2026-01-05** y luego en **2026-02-14**:
 *
 *   2026-01-05    7.654 ha   ·  parque observado  81 %
 *   2026-02-14   27.561 ha   ·  parque observado 100 %
 *
 * Seis semanas y 19.900 ha. Buena parte es crecida de verdad —el ciclo se
 * llenó de enero a febrero—, pero no toda: el día 5 de enero hay nubes sobre
 * un 19 % del parque, y bajo una nube el píxel no dice «seco», dice «no lo
 * sé». Al enmascararlo sale del cálculo, y la suma de agua se queda corta en
 * todo lo que hubiera debajo. Sin el segundo número no hay forma de saber qué
 * parte del salto es agua y qué parte es cielo despejado.
 *
 * Por eso la aplicación muestra **dos** números y avisa por debajo del 90 %.
 * Un visor que solo publica la superficie inundada está invitando a su usuario
 * a confundir la marisma con la meteorología del día de la pasada.
 *
 * Esto no es una sutileza de clase: es el fondo del trabajo de hidroperiodo
 * del LAST-EBD. Lo incómodo es que las nubes no escasean por igual todos los
 * años — abundan justo en los ciclos lluviosos, que son los que más agua
 * tienen que medir —, así que el hueco de observación se abre precisamente
 * donde más duele. Y la trampa es silenciosa: el número sale, es verosímil y
 * nadie se queja.
 *
 * Pruébalo también con **2025-12-26** (25 % observado, 2.134 ha): la
 * aplicación lo da en rojo, y así tiene que ser.
 */

// ===========================================================================
// 7. EJERCICIO
// ===========================================================================

/*
 * 1. El selector ofrece las 103 fechas del ciclo, y en casi un tercio de ellas la
 *    cobertura es ridícula. Fíltralas: queda en que el `ui.Select` solo
 *    muestre las fechas con más del 90 % del parque observado.
 *
 *    Pista: hay que calcular la cobertura de todas las fechas **antes** de
 *    construir el selector, con un `map` sobre la colección de mosaicos
 *    diarios y un único `aggregate_array`. Si lo haces con un `reduceRegion`
 *    por fecha en el cliente, Earth Engine te contesta «Too many concurrent
 *    aggregations» — y es exactamente el error que hay que haber visto una vez.
 *
 * 2. Cambia INICIO y FIN a '2023-10-01' y '2024-10-01', el ciclo de la sequía,
 *    y vuelve a mirar el máximo: 3.343 ha el 20 de febrero, frente a las
 *    27.561 del 14 de febrero de 2026. La misma aplicación, el mismo código,
 *    otra marisma.
 *
 * 3. Añade un `ui.Checkbox` que encienda y apague la lámina de agua, sin
 *    recalcularla: `Map.layers().get(CAPA_AGUA).setShown()`. Eso es gratis;
 *    volver a pintar, no.
 *
 * 4. Guarda en una variable el último `fechaTexto` pintado y no recalcules si
 *    el usuario vuelve a elegir la misma. Es el estado de la aplicación, y es
 *    el tema del script 4.
 */
