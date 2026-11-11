/**
 * Día 3 · App 3/4 — Dos mapas, un slide
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * El componente que más impresiona y el que menos cuesta: `ui.SplitPanel` con
 * dos mapas enlazados. Se arrastra la barra del medio y el antes/después
 * aparece. En una presentación vale más que diez diapositivas.
 *
 * QUÉ SE APRENDE
 *   1. Que `Map` no es «el mapa»: es **un** mapa. Se pueden crear más con
 *      `ui.Map()`.
 *   2. `ui.Map.Linker`, para que dos mapas se muevan juntos. Sin esto la
 *      comparación es mentira, porque cada lado estaría mirando otro sitio.
 *   3. `ui.SplitPanel` y `ui.root`: cómo se reparte la ventana entera.
 *   4. Que un panel se puede meter DENTRO de un mapa, que es la manera fácil
 *      de poner un control en cada lado.
 *
 * EL CASO: febrero de 2026 contra marzo de 2024. La misma
 * marisma, dos años de diferencia. 27.561 ha contra 3.695 ha.
 */

// ===========================================================================
// 1. CONFIGURACIÓN Y ANÁLISIS
// ===========================================================================

var parque = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filter(ee.Filter.eq('SITE_ID', 389012));

var ROI = parque.geometry();
var AREA_PARQUE_HA = 53327;
var UMBRAL = 0;

// Las dos fechas de arranque. Las dos con el parque observado por encima del
// 97 %, elegidas a propósito: comparar una fecha nublada con una limpia no
// compara dos marismas, compara dos días de nubes.
var IZQUIERDA = '2026-02-14';
var DERECHA   = '2024-03-11';

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

var s2 = soloHuso(ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(ROI));

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

function indiceDelDia(fechaTexto) {
  var dia = ee.Date(fechaTexto);
  return s2
    .filterDate(dia, dia.advance(1, 'day'))
    .map(mndwi)
    .mosaic()
    .select('mndwi');
}

// La lista de fechas de un año concreto, para los dos selectores.
function fechasDe(anio) {
  return s2
    .filterDate(anio + '-01-01', (anio + 1) + '-01-01')
    .aggregate_array('system:time_start')
    .map(function (t) { return ee.Date(t).format('YYYY-MM-dd'); })
    .distinct()
    .sort();
}

// ===========================================================================
// 2. DOS MAPAS
// ===========================================================================

/*
 * `Map`, el de siempre, es una variable que el Code Editor te da hecha. Nada
 * más. `ui.Map()` crea otro, y a partir de aquí el `Map` por defecto deja de
 * usarse: en el §4 lo sacamos de la ventana.
 */
var mapaIzq = ui.Map();
var mapaDer = ui.Map();

[mapaIzq, mapaDer].forEach(function (m) {
  m.setOptions('SATELLITE');
  // Los controles de dibujo fuera: en una aplicación publicada no pintan nada
  // y lo único que hacen es invitar a tocarlos.
  m.setControlVisibility({drawingToolsControl: false, layerList: false});
  m.addLayer(parque.style({color: 'ffffff', fillColor: '00000000', width: 2}),
             {}, 'Parque Nacional');
});

// ===========================================================================
// 3. QUE SE MUEVAN JUNTOS
// ===========================================================================

/*
 * Sin esto el slide engaña: arrastras la barra y los dos lados están
 * centrados en sitios distintos, así que la comparación no compara nada. El
 * `Linker` sincroniza centro y zoom de todos los mapas que le pases.
 *
 * Y hay que guardarlo en una variable aunque no se vuelva a usar: si el objeto
 * se queda sin referencia, el enlace se puede perder.
 */
var enlace = ui.Map.Linker([mapaIzq, mapaDer]);

mapaIzq.centerObject(ROI, 10);

// ===========================================================================
// 4. EL SLIDE
// ===========================================================================

/*
 * `ui.root` es la ventana. Trae dentro el `Map` de siempre y la consola; al
 * hacer `reset` con el panel partido, el `Map` por defecto se va. Es la razón
 * de que a partir de aquí los `Map.addLayer` del principio dejen de verse: no
 * están rotos, es que ese mapa ya no está en pantalla.
 *
 * `wipe: true` es lo que convierte el panel partido en slide: en vez de
 * dos mitades fijas, una barra que se arrastra.
 */
var slide = ui.SplitPanel({
  firstPanel: mapaIzq,
  secondPanel: mapaDer,
  orientation: 'horizontal',
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([slide]);

// ===========================================================================
// 5. UN CONTROL EN CADA LADO
// ===========================================================================

/*
 * El truco cómodo: el panel se añade al mapa, no a `ui.root`. Flota encima del
 * lado que le toca, se mueve con él y no hay que repartir el espacio de la
 * ventana.
 */
var CAPA_AGUA = 1;

function montarLado(mapa, anio, fechaInicial, posicion, color) {
  var panel = ui.Panel({
    style: {
      width: '240px',
      padding: '8px',
      position: posicion,
      backgroundColor: 'rgba(255, 255, 255, 0.92)'
    }
  });

  var etiqueta = ui.Label('—', {fontSize: '14px', fontWeight: 'bold'});
  var cobertura = ui.Label('', {fontSize: '11px', color: '#666'});

  var selector = ui.Select({
    items: ['cargando…'],
    disabled: true,
    style: {stretch: 'horizontal'},
    onChange: function (fechaTexto) { pintar(fechaTexto); }
  });

  function pintar(fechaTexto) {
    var indice = indiceDelDia(fechaTexto);
    var agua = indice.gt(UMBRAL).selfMask();

    mapa.layers().set(CAPA_AGUA,
      ui.Map.Layer(agua, {palette: [color]}, 'Agua ' + fechaTexto));

    var px = ee.Image.pixelArea();
    ee.Image.cat(
        indice.mask().multiply(px).rename('visto'),
        agua.multiply(px).rename('agua')
      ).reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: ROI,
        scale: 30,
        maxPixels: 1e9
      }).evaluate(function (r) {
        if (!r || r.agua === null) {
          etiqueta.setValue('sin dato');
          cobertura.setValue('');
          return;
        }
        var ha = r.agua / 10000;
        var pctVisto = r.visto / 10000 / AREA_PARQUE_HA * 100;
        etiqueta.setValue(ha.toFixed(0) + ' ha  ·  ' +
                          (ha / AREA_PARQUE_HA * 100).toFixed(1) + ' %');
        cobertura.setValue('observado el ' + pctVisto.toFixed(0) + ' % del parque' +
                           (pctVisto < 90 ? '  ⚠' : ''));
      });

    etiqueta.setValue('midiendo…');
  }

  panel.add(ui.Label(String(anio), {fontSize: '16px', fontWeight: 'bold', margin: '2px 0'}));
  panel.add(selector);
  panel.add(etiqueta);
  panel.add(cobertura);
  mapa.add(panel);

  fechasDe(anio).evaluate(function (lista) {
    if (!lista || lista.length === 0) {
      selector.setPlaceholder('sin escenas');
      return;
    }
    selector.items().reset(lista);
    selector.setDisabled(false);
    selector.setValue(lista.indexOf(fechaInicial) >= 0 ? fechaInicial : lista[0]);
  });
}

montarLado(mapaIzq, 2026, IZQUIERDA, 'top-left',    '#1f6feb');
montarLado(mapaDer, 2024, DERECHA,   'top-right',   '#d1495b');

/*
 * Los dos lados en colores distintos y no en el mismo azul: con la barra a
 * medio camino, el ojo necesita saber qué mitad está mirando. Es el detalle
 * que diferencia una comparación que se entiende de una que marea.
 */

// ===========================================================================
// 6. LO QUE SALE, Y POR QUÉ IMPORTA
// ===========================================================================

/*
 * CONTROL — con las dos fechas de arranque:
 *
 *   2026-02-14    27.561 ha    51,7 % del parque    observado 100 %
 *   2024-03-11     3.695 ha     6,9 % del parque    observado 98 %
 *
 * Cinco veces menos agua en el mismo mes del año. Y como los dos días están
 * casi enteros observados, la diferencia no se la puede comer una nube: es
 * marisma seca.
 *
 * Conviene decir en voz alta lo que la comparación NO demuestra. Dos fechas
 * sueltas no son una tendencia: 2026 fue un año húmedo y 2024 el final de una
 * sequía larga, así que esto son los dos extremos de lo que sabemos hacer. Lo
 * que mide de verdad la marisma es el **hidroperiodo** —cuántos días al año
 * está inundado cada píxel—, y eso necesita el ciclo entero, que es lo que
 * monta el script 4.
 *
 * Un slide es un instrumento de comunicación extraordinario y por eso
 * mismo hay que tratarla con cuidado: con dos fechas bien elegidas se
 * demuestra casi cualquier cosa.
 */

// ===========================================================================
// 7. EJERCICIO
// ===========================================================================

/*
 * 1. Pon las dos fechas en el mismo año (2026 a los dos lados) y compara
 *    enero con marzo: la crecida de la primavera de 2026, dentro de un ciclo.
 *
 * 2. Añade a cada lado un `ui.Checkbox` que cambie el fondo entre 'SATELLITE'
 *    y 'HYBRID'. El fondo importa más de lo que parece cuando hay que explicar
 *    qué es un lucio y qué es un arrozal.
 *
 * 3. El slide vertical: cambia `orientation` a 'vertical'. ¿Se lee mejor
 *    o peor una marisma partida en horizontal?
 *
 * 4. El difícil, y el que de verdad enseña: en vez de dos mapas con la misma
 *    capa, pinta en el mapa derecho **la diferencia** entre las dos fechas
 *    (agua en 2026 y no en 2024, en un color; lo contrario, en otro). Pista:
 *    `aguaA.unmask(0).subtract(aguaB.unmask(0))` y una paleta de tres clases.
 *    Cuidado con `unmask`, que convierte el «no observado» en «seco» — que es
 *    justo el error del §6 del script 2, y aquí lo estás cometiendo a sabiendas
 *    porque las dos fechas están casi completas.
 */
