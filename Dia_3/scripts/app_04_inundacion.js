/**
 * Día 3 · App 4/4 — El visor de inundación de la marisma, completo
 * Curso «Análisis geoespacial avanzado con Google Earth Engine» — CSIC / EBD, 2026
 *
 * Esto es el caso práctico del día: la aplicación que se publica. Junta lo de
 * los tres scripts anteriores y añade las dos cosas que faltaban —la gráfica
 * del ciclo y el estado de la aplicación— con una idea de fondo:
 *
 *   UNA APLICACIÓN NO ES UN SCRIPT CON BOTONES. Es un script que ha decidido
 *   **qué calcula una vez y qué recalcula en cada clic**. Esa decisión es el
 *   90 % de que se pueda usar o no.
 *
 * LO QUE HACE
 *   · Elegir fecha dentro de un ciclo hidrológico y ver la lámina de agua.
 *   · Cortinilla para comparar dos fechas cualesquiera del ciclo.
 *   · La serie del ciclo entero, con la superficie inundada **y la observada**.
 *   · Avisar cuando la cifra no es fiable porque ese día no se vio el parque.
 *   · Interrogar un píxel: su valor hoy y su serie en el ciclo.
 *
 * LO QUE NO HACE, y hay que decirlo antes de enseñar el mapa: esto da la
 * lámina de agua **en las fechas en que hubo escena sin nubes**, que no es lo
 * mismo que el hidroperiodo. El hidroperiodo —cuántos días al año está
 * inundado cada píxel— exige rellenar lo que no se vio, y eso es un trabajo
 * aparte y bastante más largo. Un visor de fechas sueltas es una herramienta
 * de exploración, no un producto hidrológico.
 */

// ===========================================================================
// 1. CONFIGURACIÓN — todo lo que se toca, junto y arriba
// ===========================================================================

var CICLO_INICIO = '2017-10-01';
var CICLO_FIN    = '2018-10-01';

var FECHA_A = '2018-01-22';   // lado izquierdo de la cortinilla
var FECHA_B = '2018-03-28';   // lado derecho

var UMBRAL = 0;               // MNDWI por encima de esto es agua
var MINIMO_VISTO = 90;        // % del parque observado para fiarse de la cifra
var ESCALA = 30;              // m, para las mediciones de área

var AREA_PARQUE_HA = 53327;

var AZUL = '#1f6feb';
var ROJO = '#d1495b';

// ===========================================================================
// 2. EL ANÁLISIS
// ===========================================================================

var parque = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filter(ee.Filter.eq('SITE_ID', 389012));

var ROI = parque.geometry();
var estiloParque = parque.style({color: 'ffffff', fillColor: '00000000', width: 2});

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(ROI)
  .filterDate(CICLO_INICIO, CICLO_FIN);

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

var fechas = s2
  .aggregate_array('system:time_start')
  .map(function (t) { return ee.Date(t).format('YYYY-MM-dd'); })
  .distinct()
  .sort();

function indiceDelDia(fechaTexto) {
  var dia = ee.Date(fechaTexto);
  return s2
    .filterDate(dia, dia.advance(1, 'day'))
    .map(mndwi)
    .mosaic()
    .select('mndwi')
    .set('system:time_start', dia.millis());
}

// La colección de mosaicos diarios del ciclo. Se construye una vez y de ella
// sale la gráfica y la serie del píxel.
var diarios = ee.ImageCollection(fechas.map(function (f) {
  return indiceDelDia(ee.String(f));
}));

// ===========================================================================
// 3. LA VENTANA: PANEL DE CONTROL + CORTINILLA
// ===========================================================================

var mapaIzq = ui.Map();
var mapaDer = ui.Map();

[mapaIzq, mapaDer].forEach(function (m) {
  m.setOptions('SATELLITE');
  m.setControlVisibility({drawingToolsControl: false, layerList: false});
  m.addLayer(estiloParque, {}, 'Parque Nacional');       // capa 0
});

var enlace = ui.Map.Linker([mapaIzq, mapaDer]);
mapaIzq.centerObject(ROI, 10);

var cortinilla = ui.SplitPanel({
  firstPanel: mapaIzq,
  secondPanel: mapaDer,
  orientation: 'horizontal',
  wipe: true,
  style: {stretch: 'both'}
});

var control = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '360px', padding: '10px'}
});

/*
 * `ui.root` es la ventana entera. Al hacer `reset` desaparecen el mapa por
 * defecto y la consola: a partir de aquí `print()` no se ve en ninguna parte,
 * así que lo que la aplicación tenga que contar lo cuenta con etiquetas.
 *
 * Es LA línea que hay que mirar si la aplicación sale descolocada.
 */
ui.root.widgets().reset([control, cortinilla]);
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

// ===========================================================================
// 4. EL ESTADO DE LA APLICACIÓN
// ===========================================================================

/*
 * Aquí está la idea del bloque de rendimiento del día. Una aplicación tiene
 * **estado**: lo que está puesto ahora mismo. Guardarlo en un objeto y
 * consultarlo antes de recalcular evita el 90 % del trabajo repetido.
 *
 * El caso típico: el usuario vuelve a elegir la fecha que ya estaba puesta, o
 * mueve el deslizador y lo devuelve a su sitio. Sin estado, eso son dos
 * recálculos completos; con estado, ninguno.
 *
 * Lo que NO se guarda aquí son imágenes: `ee.Image` es una receta, no un dato,
 * y guardarla no evita que el servidor la cocine otra vez. Lo que se guarda es
 * lo que ha pedido el usuario.
 */
var estado = {
  izq: null,
  der: null,
  umbral: UMBRAL
};

// ===========================================================================
// 5. PINTAR Y MEDIR UN LADO
// ===========================================================================

/*
 * Las etiquetas que la medición va a rellenar se declaran AQUÍ, antes de la
 * función que las escribe. En JavaScript las funciones se pueden declarar
 * después de usarse, pero las variables no: si estas cuatro líneas estuvieran
 * más abajo, `pintarLado` las vería como `undefined` el día que alguien la
 * llame un poco antes de lo previsto. Declarar antes de usar cuesta nada.
 */
var cifraIzq = ui.Label('—', {fontSize: '14px', fontWeight: 'bold', color: AZUL});
var notaIzq = ui.Label('', {fontSize: '11px', color: '#666'});
var cifraDer = ui.Label('—', {fontSize: '14px', fontWeight: 'bold', color: ROJO});
var notaDer = ui.Label('', {fontSize: '11px', color: '#666'});


var CAPA_AGUA = 1;

function pintarLado(lado, fechaTexto) {
  if (!fechaTexto) { return; }

  var mapa = (lado === 'izq') ? mapaIzq : mapaDer;
  var color = (lado === 'izq') ? AZUL : ROJO;
  var cifra = (lado === 'izq') ? cifraIzq : cifraDer;
  var nota = (lado === 'izq') ? notaIzq : notaDer;

  // El estado, trabajando: misma fecha y mismo umbral, no se toca nada.
  if (estado[lado] === fechaTexto + '@' + estado.umbral) { return; }
  estado[lado] = fechaTexto + '@' + estado.umbral;

  var indice = indiceDelDia(fechaTexto);
  var agua = indice.gt(estado.umbral).selfMask();

  mapa.layers().set(CAPA_AGUA,
    ui.Map.Layer(agua, {palette: [color]}, 'Agua ' + fechaTexto));

  cifra.setValue('midiendo…');
  nota.setValue('');

  var px = ee.Image.pixelArea();
  ee.Image.cat(
      indice.mask().multiply(px).rename('visto'),
      agua.multiply(px).rename('agua')
    ).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: ROI,
      scale: ESCALA,
      maxPixels: 1e9
    }).evaluate(function (r) {
      if (!r || r.agua === null || r.visto === null) {
        cifra.setValue('sin dato para esta fecha');
        return;
      }
      var ha = r.agua / 10000;
      var pctVisto = r.visto / 10000 / AREA_PARQUE_HA * 100;

      cifra.setValue(ha.toFixed(0) + ' ha  ·  ' +
                     (ha / AREA_PARQUE_HA * 100).toFixed(1) + ' % del parque');

      if (pctVisto < MINIMO_VISTO) {
        nota.setValue('⚠ ese día solo se vio el ' + pctVisto.toFixed(0) +
                      ' % del parque: la cifra es un mínimo');
        nota.style().set('color', '#b33');
      } else {
        nota.setValue('parque observado: ' + pctVisto.toFixed(0) + ' %');
        nota.style().set('color', '#666');
      }
    });
}

// ===========================================================================
// 6. LOS CONTROLES
// ===========================================================================

control.add(ui.Label('Inundación de la marisma', {fontSize: '20px', fontWeight: 'bold'}));
control.add(ui.Label('Parque Nacional de Doñana · Sentinel-2 · MNDWI',
                     {fontSize: '12px', color: '#666', margin: '0 0 2px 0'}));
control.add(ui.Label('Ciclo hidrológico ' + CICLO_INICIO.slice(0, 4) + '/' +
                     CICLO_FIN.slice(2, 4),
                     {fontSize: '12px', color: '#666', margin: '0 0 12px 0'}));

var selectorIzq = ui.Select({
  items: ['cargando…'], disabled: true, style: {stretch: 'horizontal'},
  onChange: function (f) { pintarLado('izq', f); }
});
var selectorDer = ui.Select({
  items: ['cargando…'], disabled: true, style: {stretch: 'horizontal'},
  onChange: function (f) { pintarLado('der', f); }
});

control.add(ui.Label('Izquierda de la cortinilla', {fontSize: '12px', fontWeight: 'bold'}));
control.add(selectorIzq);
control.add(cifraIzq);
control.add(notaIzq);

control.add(ui.Label('Derecha de la cortinilla',
                     {fontSize: '12px', fontWeight: 'bold', margin: '14px 0 0 0'}));
control.add(selectorDer);
control.add(cifraDer);
control.add(notaDer);

/*
 * El deslizador del umbral afecta a los DOS lados, y por eso invalida el
 * estado de los dos: si no se borra, el `return` del §5 daría por bueno lo que
 * ya estaba pintado y el mapa no cambiaría. Es el fallo clásico de tener
 * estado, y se ve una vez y no se olvida.
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
  min: -30, max: 40, value: UMBRAL * 100, step: 5,   // centésimas de MNDWI
  style: {stretch: 'horizontal'}
});

deslizador.onChange(function (v) {
  estado.umbral = v / 100;                            // de centésimas a MNDWI
  estado.izq = null;
  estado.der = null;
  pintarLado('izq', selectorIzq.getValue());
  pintarLado('der', selectorDer.getValue());
});

control.add(ui.Label('Umbral de MNDWI para considerar agua (centésimas)',
                     {fontSize: '12px', fontWeight: 'bold', margin: '16px 0 0 0'}));
control.add(deslizador);
control.add(ui.Label('Por encima de 0 es la convención. Súbelo y verás ' +
                     'desaparecer la lámina somera, que es justo la que más ' +
                     'cuesta decidir.',
                     {fontSize: '11px', color: '#666'}));

// ===========================================================================
// 7. LA GRÁFICA DEL CICLO
// ===========================================================================

/*
 * DOS SERIES, Y LA SEGUNDA ES LA IMPORTANTE:
 *
 *   · superficie inundada
 *   · superficie observada del parque ese día
 *
 * Si solo se dibuja la primera, la curva baja en picado unas cuantas veces al
 * año y cualquiera leería «se secó y volvió a llenarse en cinco días». Con la
 * segunda encima se ve lo que pasa de verdad: **los desplomes de la inundación
 * caen justo donde se desploma la observación**. No son bajadas de agua, son
 * días de nubes.
 *
 * Es la gráfica más honesta que puede llevar un visor de inundación, y casi
 * ninguno la lleva.
 *
 * SE CALCULA UNA VEZ, al abrir la aplicación, y no se vuelve a tocar. Son 68
 * fechas por dos reducciones sobre 53.000 ha: unos segundos. Hacerlo en cada
 * clic sería inaceptable, y es el error que convierte una aplicación en algo
 * que nadie abre dos veces.
 *
 * (Por eso la gráfica va con el umbral fijo de la configuración y no sigue al
 * deslizador: ver el ejercicio 1.)
 */
var px = ee.Image.pixelArea();

var serie = diarios.map(function (img) {
  var agua = img.gt(UMBRAL).selfMask();
  return ee.Image.cat(
      agua.multiply(px).divide(10000).rename('inundado_ha'),
      img.mask().multiply(px).divide(10000).rename('observado_ha')
    ).copyProperties(img, ['system:time_start']);
});

var grafica = ui.Chart.image.series({
  imageCollection: serie,
  region: ROI,
  reducer: ee.Reducer.sum(),
  scale: ESCALA
}).setOptions({
  title: 'Superficie inundada y superficie observada',
  vAxis: {title: 'hectáreas'},
  hAxis: {title: ''},
  colors: [AZUL, '#999999'],
  lineWidth: 2,
  pointSize: 3,
  series: {1: {lineDashStyle: [4, 4], pointSize: 0}},
  legend: {position: 'top'}
});

// El panel mide 360 px, así que la gráfica hay que acotarla o se sale. El
// tamaño es estilo del widget, no opción del gráfico: `setOptions` no lo toca.
grafica.style().set({width: '340px', height: '220px'});

control.add(ui.Label('El ciclo completo',
                     {fontSize: '12px', fontWeight: 'bold', margin: '18px 0 0 0'}));
control.add(grafica);

// ===========================================================================
// 8. LA LEYENDA
// ===========================================================================

/*
 * Earth Engine no trae leyendas: se construyen a mano con paneles. Es tedioso
 * y es imprescindible — un mapa publicado sin leyenda no es un mapa, es una
 * imagen bonita.
 *
 * El patrón: un panel horizontal con una cajita de color (un `ui.Label` vacío
 * con `backgroundColor` y un tamaño fijo) y el texto al lado.
 */
function filaLeyenda(color, texto) {
  var caja = ui.Label('', {
    backgroundColor: color,
    padding: '8px',
    margin: '0 6px 4px 0',
    border: '1px solid #999'
  });
  return ui.Panel({
    widgets: [caja, ui.Label(texto, {fontSize: '12px', margin: '4px 0'})],
    layout: ui.Panel.Layout.flow('horizontal')
  });
}

var leyenda = ui.Panel({style: {margin: '12px 0 0 0'}});
leyenda.add(ui.Label('Leyenda', {fontSize: '12px', fontWeight: 'bold'}));
leyenda.add(filaLeyenda(AZUL, 'Agua · fecha de la izquierda'));
leyenda.add(filaLeyenda(ROJO, 'Agua · fecha de la derecha'));
leyenda.add(filaLeyenda('#ffffff', 'Límite del Parque Nacional'));
control.add(leyenda);

// ===========================================================================
// 9. INTERROGAR UN PÍXEL
// ===========================================================================

/*
 * El clic se registra en los dos mapas, porque el usuario no tiene por qué
 * saber en qué mitad de la cortinilla ha pinchado.
 *
 * Y aquí sí hay un cálculo caro en respuesta a un clic: la serie de ese píxel
 * en el ciclo entero. Se permite porque es **un píxel** —no 53.000 ha— y
 * porque es la pregunta que el usuario quiere hacer de verdad: «¿y este lucio,
 * cuánto tiempo estuvo con agua?».
 */
var panelPixel = ui.Panel({style: {margin: '14px 0 0 0'}});
control.add(panelPixel);

function consultarPixel(coords) {
  var punto = ee.Geometry.Point([coords.lon, coords.lat]);

  panelPixel.clear();
  panelPixel.add(ui.Label('Píxel ' + coords.lon.toFixed(4) + ', ' +
                          coords.lat.toFixed(4),
                          {fontSize: '12px', fontWeight: 'bold'}));
  panelPixel.add(ui.Label('calculando la serie del punto…',
                          {fontSize: '11px', color: '#666'}));

  var graficaPixel = ui.Chart.image.series({
    imageCollection: diarios,
    region: punto,
    reducer: ee.Reducer.first(),
    scale: 20
  }).setOptions({
    title: 'MNDWI en este punto',
    vAxis: {title: 'MNDWI', viewWindow: {min: -1, max: 1}},
    hAxis: {title: ''},
    colors: [AZUL],
    pointSize: 3,
    lineWidth: 1,
    legend: {position: 'none'}
  });

  graficaPixel.style().set({width: '340px', height: '180px'});

  panelPixel.widgets().set(1, graficaPixel);
  panelPixel.add(ui.Label(
    'Los huecos de la línea son fechas en las que ese píxel no se vio. ' +
    'No son ceros: son ausencias.',
    {fontSize: '11px', color: '#666'}));
}

mapaIzq.onClick(consultarPixel);
mapaDer.onClick(consultarPixel);

// ===========================================================================
// 10. ARRANQUE
// ===========================================================================

/*
 * Lo último del script y lo primero que ve el usuario. La aplicación se
 * termina de construir dentro del `evaluate`, porque hasta que no llega la
 * lista de fechas no hay nada que elegir.
 *
 * Y arranca con dos fechas elegidas a mano, no con las dos primeras de la
 * lista: enero contra marzo de 2018 es la crecida del ciclo, y una aplicación
 * tiene que abrir enseñando lo que sabe hacer. Si abre en un mapa vacío, el
 * usuario cierra la pestaña.
 */
fechas.evaluate(function (lista) {
  if (!lista || lista.length === 0) {
    control.add(ui.Label('No hay escenas en el ciclo configurado.',
                         {color: '#b33'}));
    return;
  }

  selectorIzq.items().reset(lista);
  selectorDer.items().reset(lista);
  selectorIzq.setDisabled(false);
  selectorDer.setDisabled(false);

  function oPrimera(f) { return lista.indexOf(f) >= 0 ? f : lista[0]; }

  selectorIzq.setValue(oPrimera(FECHA_A));
  selectorDer.setValue(oPrimera(FECHA_B));
});

/*
 * CONTROL — al abrir, la aplicación tiene que dar:
 *
 *   izquierda  2018-01-22    4.276 ha   ·  8,0 %   ·  observado 100 %
 *   derecha    2018-03-28   19.313 ha   ·  36,2 %  ·  observado  99 %
 *
 * Y en la gráfica, el pico de finales de marzo con la línea gris pegada
 * arriba la mayor parte del tiempo, y cayendo a plomo en los días de nubes.
 * Esos desplomes no son tres o cuatro: de las **68 fechas del ciclo**, 28
 * tienen menos del 90 % del parque observado, **17 menos del 50 %** y 6 menos
 * del 5 %. La mediana, eso sí, es del 97 %.
 *
 * Y ahí está la lección de la gráfica, que es el motivo de dibujar la línea
 * gris: en esas 17 fechas la cifra de hectáreas inundadas no es baja porque
 * haya poca agua, es baja porque no se ve el parque. Un visor que solo pintara
 * la línea azul estaría mintiendo diecisiete veces por ciclo.
 */

// ===========================================================================
// 11. PUBLICAR
// ===========================================================================

/*
 * Botón **Apps** arriba a la derecha del Code Editor → *New App*.
 *
 * Y las cuatro cosas que hay que saber antes de pulsarlo:
 *
 * 1. LA APP CORRE CON TU CUOTA. Cada visitante gasta EECU de tu proyecto, no
 *    del suyo. Una aplicación que recalcula el ciclo entero en cada clic y que
 *    se comparte en Twitter te puede dejar el proyecto bloqueado. Es la razón
 *    técnica de todo el §4 y el §7 de este script.
 *
 * 2. LA APP APUNTA A UNA COPIA DEL CÓDIGO, no a tu script vivo. Puedes seguir
 *    trabajando sin romper lo publicado, y hay que **volver a publicar** para
 *    que los cambios salgan. Esto desconcierta siempre la primera vez: has
 *    corregido el error, lo has guardado, y la App sigue mal.
 *
 * 3. LOS ASSETS NO SE PUBLICAN SOLOS. Si la aplicación usa un asset privado
 *    tuyo, tú la ves y tus visitantes no, porque tú tienes permiso y ellos no.
 *    Aquí no pasa, porque WDPA y Sentinel-2 son públicos; con el asset de
 *    embalses del otro caso, sí: hay que compartirlo.
 *
 * 4. EL ENLACE ES PÚBLICO SI TÚ QUIERES. Se puede restringir por dominio o
 *    dejarlo abierto. Y una vez abierto, está abierto: piénsalo antes si la
 *    aplicación enseña algo que no debería salir del grupo.
 */

// ===========================================================================
// 12. EJERCICIO
// ===========================================================================

/*
 * 1. Haz que la gráfica siga al deslizador del umbral. Funciona, y notarás
 *    exactamente por qué no viene así: cada movimiento del deslizador vuelve a
 *    reducir 68 fechas. Mídelo, y después decide tú. Un `ui.Button` de
 *    «recalcular la gráfica» es una solución perfectamente profesional.
 *
 * 2. Añade un `ui.Textbox` para el año y que la aplicación cambie de ciclo. Es
 *    más trabajo del que parece: hay que rehacer la colección, las fechas, la
 *    gráfica y los dos selectores. Ordenar eso en una función
 *    `cargarCiclo(anio)` es el ejercicio de verdad.
 *
 * 3. Un `ui.Button` que exporte a Drive la máscara de agua de la fecha de la
 *    izquierda. Ojo: `Export.image.toDrive` dentro de una App **no funciona**
 *    —la exportación la lanza el Code Editor, no la aplicación—, así que esto
 *    es un buen sitio para descubrir qué cosas no se pueden publicar.
 *
 * 4. Y el que más rinde: dale a alguien que no haya visto el código la
 *    aplicación tal cual y mírale usarla sin decir nada. Donde dude, falta una
 *    etiqueta.
 */
