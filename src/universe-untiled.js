//helpers
h={
	showObj: function(o){
		//object to string including methods
		var s="";
		for (i in o) s+=i+":"+o[i]+"\n\n";
		h.showWin(s);
	},

	//displaying string in a new window
	showWin: function(s){
		var pattern=new RegExp('^<html>','i');
		if(!pattern.test(s)){
			s=s.replace(new RegExp("[<]","g"),'&lt');s=s.replace(new RegExp("[>]","g"),'&gt');
			s='<html><body><pre>'+s+'</pre></html></body>';
		}
		var W = window.open("",'','Width=600,Height=480,resizable=yes,scrollbars=yes,left=0,top=0',true);
		W.focus();W.document.open();W.document.write(s);W.document.close();
	},

	// extraction for URL parameters
	getQueryVariable: function(variable) {
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
};



// check WebGL
if (!window.WebGLRenderingContext) {
  // the browser doesn't even know what WebGL is
  window.location = "http://get.webgl.org";
}

Dim = {
  div: document.getElementById("webgl"),
  envelope: [],
  demWidth: 0,
  demHeight: 0,
  pixelsPerVertex: 8,//the resolution of the height model in the image
  wcsUrl: 'http://wms.geonorge.no/skwms1/wcs.dtm',
  wcsResolution: 10, //resolution of grid cell in meters
  proxy: "/requester/kurer?",
  
  bbox: h.getQueryVariable("BBOX")||'161244,6831251,171526,6837409',
  crs: h.getQueryVariable("CRS") || h.getQueryVariable("SRS") || 'EPSG:32633',
  coverage: h.getQueryVariable("COVERAGE") || 'land_utm33_10m',//'land_utm33_10m',
  imgUrl: h.getQueryVariable("IMAGE")||false,
  wmsUrl: h.getQueryVariable("WMS") || 'http://wms.geonorge.no/skwms1/wms.topo2',
  //wmsUrl: h.getQueryVariable("WMS") || 'http://openwms.statkart.no/skwms1/wms.topo2',
  wmsLayers: h.getQueryVariable("LAYERS") || 'topo2_WMS',//layers //'topo2_WMS'
  wmsFormat: h.getQueryVariable("FORMAT") || "image/png",
  wmsFormatMode: "",
  zMult: h.getQueryVariable("ZMULT")||1,
  wireframe: h.getQueryVariable("WIREFRAME")||false,
  imgWidth: h.getQueryVariable("WIDTH")||false,
  imgHeight: h.getQueryVariable("HEIGHT")||false,
  zInv: h.getQueryVariable("ZINV")||false,
  Z: h.getQueryVariable("Z")||0,
  
  init: function () {
	this.width = this.div.clientWidth;
	this.height = this.div.clientHeight;
	
	if (this.imgUrl) this.wmsUrl = false;
	
	//Bbox
    var bbox = this.bbox.split(',');
	this.envelope = [Number(bbox[0]), Number(bbox[1]), Number(bbox[2]), Number(bbox[3])];
    this.metersWidth = this.envelope[2] - this.envelope[0];
    this.metersHeight = this.envelope[3] - this.envelope[1];
	
	//Format mode
    if (h.getQueryVariable("WMSFORMATMODE")) {
      this.wmsFormatMode = '; mode=' + h.getQueryVariable("WMSFORMATMODE");
    }

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
	//console.log(this.imgWidth, this.imgHeight);

	//Compute the resolution of the height model in the image (pixelsPerVertex)
	this.demWidth = Math.round(this.imgWidth /  this.pixelsPerVertex);
	this.demHeight = Math.round(this.imgHeight / this.pixelsPerVertex);
	
	//When zooming into large scales, the computed resolution of the height model will be larger than the actual resolution.
	//Adjustment to actual resolution is made to avoid stairs effect in the height model.
	if (this.demWidth>this.metersWidth/this.wcsResolution){
		//ajust to avoid stairs in the model - reduse dem to actual resolution
		this.demWidth = Math.round(this.metersWidth/this.wcsResolution);
		this.demHeight = Math.round(this.metersHeight/this.wcsResolution);
	}
	//console.log(this.demWidth, this.demHeight);
	
	//Adjust zMult
	var proportionWidth=this.metersWidth/this.demWidth; // mapunits between vertexes in x-dimention
	var proportionHeight=this.metersHeight/this.demHeight; // mapunits between vertexes in y-dimention
	var proportionAverage=((proportionWidth+proportionHeight)/2); // average mapunits between vertexes

	if (this.zInv){
      proportionAverage=proportionAverage*-1;
	}
	if (this.zMult){
		this.zMult=proportionAverage/this.zMult;
	} else {
		this.zMult=proportionAverage;
	}
	
	if (this.proxy) {
		if (this.wmsUrl) this.wmsUrl = this.proxy + this.wmsUrl;
		this.wcsUrl = this.proxy + this.wcsUrl;
	}
	
    return this;
  }
};

var dim = Dim.init();
var threeDMap = new wxs3.ThreeDMap(dim);
