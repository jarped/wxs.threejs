import * as _ from 'underscore';

import ThreeDMapUntiled from './wxs.three-untiled.js';
import toUtm33 from './util/toUtm33';

var Dim = {
  envelope: [],
  demWidth: 0,
  demHeight: 0,
  pixelsPerVertex: 8, //the resolution of the height model in the image
  wcsUrl: 'http://wms.geonorge.no/skwms1/wcs.dtm',
  wcsResolution: 10, //resolution of grid cell in meters
//  proxy: '/requester/kurer?',
  
  //bbox: h.getQueryVariable('BBOX')||'161244,6831251,171526,6837409',
  crs: /*h.getQueryVariable('CRS') || h.getQueryVariable('SRS') ||*/ 'EPSG:32633',
  coverage: /*h.getQueryVariable('COVERAGE') ||*/ 'land_utm33_10m', //'land_utm33_10m',
  imgUrl: /*h.getQueryVariable('IMAGE')||*/false,
  //wmsUrl: h.getQueryVariable('WMS') || 'http://wms.geonorge.no/skwms1/wms.topo2',
  //wmsUrl: h.getQueryVariable('WMS') || 'http://openwms.statkart.no/skwms1/wms.topo2',
  //wmsLayers: h.getQueryVariable('LAYERS') || 'topo2_WMS', //layers //'topo2_WMS'
  wmsFormat: /*h.getQueryVariable('FORMAT') ||*/ 'image/png',
  //wmsFormat: 'image/png',
  wmsFormatMode: '',
  //zMult: h.getQueryVariable('ZMULT')||1,
  wireframe: /*h.getQueryVariable('WIREFRAME')||*/false,
  imgWidth: /*h.getQueryVariable('WIDTH')||*/false,
  imgHeight: /*h.getQueryVariable('HEIGHT')||*/false,
  zInv: /*h.getQueryVariable('ZINV')||*/false,
  Z: /*h.getQueryVariable('Z')||*/0,

  init: function (config) {

    this.wmsUrl = config.wmsUrl;
    this.div = document.getElementById(config.div);
    this.bbox = config.bbox;
    this.wmsLayers = config.wmsLayers;
    this.zMult = config.zMult;

    this.width = this.div.clientWidth;
    this.height = this.div.clientHeight;

    if (this.imgUrl) {
        this.wmsUrl = false;
    }

    //Bbox
    var bbox = _.map(this.bbox.split(','), parseFloat);
    var ne = [bbox[0], bbox[1]];
    var sw = [bbox[2], bbox[3]];
    var ne33 = toUtm33(ne);
    var sw33 = toUtm33(sw);

    this.envelope = ne33.concat(sw33);

    this.metersWidth = this.envelope[2] - this.envelope[0];
    this.metersHeight = this.envelope[3] - this.envelope[1];



    //Adjust output image to canvas if not specified
    if (!this.imgWidth || !this.imgHeight){
        var imgCoefficient = this.metersWidth / this.metersHeight;
        if ((this.width/this.height)<imgCoefficient){
            this.imgWidth = this.width;
            this.imgHeight = Math.round(this.imgWidth / imgCoefficient);
        } else {
            this.imgHeight = this.height;
            this.imgWidth = Math.round(this.imgHeight * imgCoefficient);
        }
    }

    //Compute the resolution of the height model in the image (pixelsPerVertex)
    this.demWidth = Math.round(this.imgWidth /  this.pixelsPerVertex);
    this.demHeight = Math.round(this.imgHeight / this.pixelsPerVertex);
    
    //When zooming into large scales, the computed resolution of the height model will be larger than the actual resolution.
    //Adjustment to actual resolution is made to avoid stairs effect in the height model.
    if (this.demWidth > this.metersWidth / this.wcsResolution){
        //ajust to avoid stairs in the model - reduse dem to actual resolution
        this.demWidth = Math.round(this.metersWidth / this.wcsResolution);
        this.demHeight = Math.round(this.metersHeight / this.wcsResolution);
    }
    //console.log(this.demWidth, this.demHeight);
    
    //Adjust zMult
    var proportionWidth = this.metersWidth / this.demWidth; // mapunits between vertexes in x-dimention
    var proportionHeight = this.metersHeight / this.demHeight; // mapunits between vertexes in y-dimention
    var proportionAverage = ((proportionWidth + proportionHeight) / 2); // average mapunits between vertexes

    if (this.zInv){
      proportionAverage=proportionAverage*-1;
    }
    if (this.zMult){
        this.zMult=proportionAverage/this.zMult;
    } else {
        this.zMult=proportionAverage;
    }

    if (this.proxy) {
        if (this.wmsUrl) {
            this.wmsUrl = this.proxy + this.wmsUrl;
        }
        this.wcsUrl = this.proxy + this.wcsUrl;
    }

    return this;
  }
};

window.WXSThree = window.WXSThree || {};
window.WXSThree.untiled = function (config) {
    var dim = Dim.init(config);
    return new ThreeDMapUntiled(dim);
};

