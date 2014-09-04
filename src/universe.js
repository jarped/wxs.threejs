// extraction for URL parameters
function getQueryVariable(variable) {
  var pair, i;
  var query = window.location.search.substring(1);
  var vars = query.split("&");
  for (i = 0; i < vars.length; i = i + 1) {
    pair = vars[i].split("=");
    if (pair[0].toUpperCase() === variable) {
      return pair[1];
    }
  }
  return false;
}


// check WebGL
if (!window.WebGLRenderingContext) {
  // the browser doesn't even know what WebGL is
  window.location = "http://get.webgl.org";
}

// utility func to convert dict of {key: "val", key2: "val2"} to key=val&key2=val2
function urlformat(values) {
  var res = [], key;
  for (key in values) {
    if (values.hasOwnProperty(key)) {
      res.push(key + '=' + values[key]);
    }
  }
  return res.join('&');
}

// TODO: Update this to allow for wmts, variable wcs ++
Dim = {
  width: window.innerWidth,
  height: window.innerHeight,
  bbox: getQueryVariable("BBOX") || '161244,6831251,171526,6837409',
  minx: 0,
  maxx: 0,
  miny: 0,
  maxy: 0,
  Z:0,
  getBounds: function () {
    return {
      minx: this.minx,
      miny: this.miny,
      maxx: this.maxx,
      maxy: this.maxy
    };
  },
  init: function () {
    var splitBbox = this.bbox.split(',');
    this.metersWidth = splitBbox[2] - splitBbox[0];
    this.metersHeight = splitBbox[3] - splitBbox[1];
    this.minx = parseInt(splitBbox[0], 10);
    this.maxx = parseInt(splitBbox[2], 10);
    this.miny = parseInt(splitBbox[1], 10);
    this.maxy = parseInt(splitBbox[3], 10);

    if (getQueryVariable("WMSFORMATMODE")) {
      this.wmsFormatMode = '; mode=' + getQueryVariable("WMSFORMATMODE");
    }
    return this;
  },
  crs: getQueryVariable("CRS") || getQueryVariable("SRS") || '32633',
  coverage: getQueryVariable("COVERAGE") || 'land_utm33_10m',
  wmsUrl: getQueryVariable("WMS") || false,
  wmtsLayer: getQueryVariable("LAYER") || 'topo2',
  wmsLayers: getQueryVariable("LAYERS") || 'topo2',
  wmtsUrl: getQueryVariable("WMTS") || 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts',
  wmscUrl:  getQueryVariable("WMSC") || 'http://opencache.statkart.no/gatekeeper/gk/gk.open_cache',
  wcsUrl: getQueryVariable("WCS")||'http://wms.geonorge.no/skwms1/wcs.dtm',
  wmsFormat: getQueryVariable("WMSFORMAT") || "image/png",
  wmsFormatMode: "",
  gatekeeperTicket: getQueryVariable("GKT")||false,
  zMult: getQueryVariable("ZMULT") || 1
};

var dim = Dim.init();
var wmsLayers = getQueryVariable("LAYERS") || layers;
var threeDMap = new wxs3.ThreeDMap(wmsLayers, dim);