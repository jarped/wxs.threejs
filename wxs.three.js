var wxs3 = wxs3 || {};

(function (ns) {
    'use strict';

    //check WebGL
    if (!window.WebGLRenderingContext) {
        // the browser doesn't even know what WebGL is
        window.location = "http://get.webgl.org";
    }

    //utility func to convert dict of {key: "val", key2: "val2"} to key=val&key2=val2
    function urlformat(values) {
        var res = [], key;
        for (key in values) {
            if (values.hasOwnProperty(key)) {
                var value = values[key];
                res.push(key + '=' + value);
            }
        }
        return res.join('&');
    }

    var WCSTile = function (dim, tileNr, bounds) {
        this.dim = dim;
        this.tileNr = tileNr;
        this.bounds = bounds;
        this.loaded = false;
    };

    WCSTile.prototype.getWcsBbox = function () {
        return [
            parseInt(this.bounds.minx, 10),
            parseInt(this.bounds.miny - this.dim.proportionHeight, 10),
            parseInt(this.bounds.maxx + this.dim.proportionWidth, 10),
            parseInt(this.bounds.maxy, 10)
        ].join(',');
    };

    WCSTile.prototype.load = function (callback) {

        this.callback = callback;

        var params = {
            SERVICE: 'WCS',
            VERSION: '1.0.0',
            REQUEST: 'GetCoverage',
            FORMAT: 'XYZ',
            COVERAGE: this.dim.coverage,
            bbox: this.getWcsBbox(),
            CRS: this.dim.crs,
            RESPONSE_CRS: this.dim.crs,
            WIDTH: parseInt(this.dim.demWidth, 10),
            HEIGHT: parseInt(this.dim.demHeight, 10)
        };

        var url = this.dim.wcsUrl + '?' + urlformat(params);

        var demTileRequest = new XMLHttpRequest();
        demTileRequest.open('GET', url, true);

        var that = this;
        demTileRequest.onreadystatechange = function () {
            if (this.readyState === 4) {
                that.demTileLoaded(this.responseText);
            }
        };
        demTileRequest.send();

        //allows chaining
        return this;
    };

    WCSTile.prototype.createGeometry = function (xyzlines) {

        var geometry = new THREE.PlaneGeometry(
            this.bounds.maxx - this.bounds.minx,
            this.bounds.maxy - this.bounds.miny,
            (this.dim.demWidth - 1),
            (this.dim.demHeight - 1)
        );

        var i, length = geometry.vertices.length;
        for (i = 0; i < length; i = i + 1) {
            var line = xyzlines[i].split(' ');
            geometry.vertices[i].x = line[0];
            geometry.vertices[i].y = line[1];
            geometry.vertices[i].z = line[2] ;
        }
        return geometry;
    };

    WCSTile.prototype.getWmsBbox = function () {

        var lastIndex = this.geometry.vertices.length - 1;

        var firstVertex = this.geometry.vertices[0];
        var lastVertex = this.geometry.vertices[lastIndex];
        return [
            firstVertex.x,
            lastVertex.y,
            lastVertex.x,
            firstVertex.y
        ].join(',');
    };

    WCSTile.prototype.demTileLoaded = function (responseText) {
        this.geometry = this.createGeometry(responseText.split("\n"));

        this.plane = new THREE.Mesh(
            this.geometry,
            this.createMaterial()
        );
        this.plane.name = 'tile_' + this.tileNr;
        this.plane.scale.z=dim.zMult;
        this.loaded = true; //not used yet
        this.callback(this);
    };

    WCSTile.prototype.createMaterial = function () {
        var params = {
            service: 'wms',
            version: '1.3.0',
            request: 'getmap',
            crs: this.dim.crs,
            srs: this.dim.crs,
            WIDTH: this.dim.demWidth * this.dim.wmsMult,
            HEIGHT: this.dim.demHeight * this.dim.wmsMult,
            bbox: this.getWmsBbox(),
            layers: this.dim.wmsLayers,
            format: this.dim.wmsFormat + this.dim.wmsFormatMode
        };

        var material = new THREE.MeshPhongMaterial(
            {
                map: THREE.ImageUtils.loadTexture(
                    this.dim.wmsUrl + '?' + urlformat(params),
                    new THREE.UVMapping()
                )
            }
        );
        material.name = 'material_' + this.tileNr;
        return material;
    };

    ns.ThreeDMap = function (layers, dim) {

        this.dim = dim;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;


        //TODO: these shpuld be moved to separate functions to improve
        //readability. I'm not quite certain how to name these functions
        if (dim.metersWidth > dim.metersHeight) {
            var widthHeightRatio = dim.metersWidth / dim.metersHeight;
            dim.demWidth = parseInt(widthHeightRatio * dim.demWidth, 10);
        } else if (dim.metersWidth < dim.metersHeight) {
            var heightWidthRatio = dim.metersHeight / dim.metersWidth;
            dim.demHeight = parseInt(heightWidthRatio * dim.demHeight, 10);
        }

        // mapunits between vertexes in x-dimension
        dim.proportionWidth = dim.metersWidth / dim.demWidth;

        // mapunits between vertexes in y-dimension
        dim.proportionHeight = dim.metersHeight / dim.demHeight;

        this.dim.wmsLayers = layers;

        this.createRenderer();
        this.createScene();
        this.createCamera();
        this.createControls();

        // Generate tiles and boundingboxes
        this.bbox2tiles(this.dim.getBounds());
        //var wmtsCalls=this.bbox2tiles(this.dim.getBounds());
		//this.tileLoader(wmtsCalls);
        document.getElementById('webgl').appendChild(this.renderer.domElement);
    };

    ns.ThreeDMap.prototype.createRenderer = function () {
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.dim.width, this.dim.height);
    };

    ns.ThreeDMap.prototype.createScene = function () {
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xeeeeee));
    };

    ns.ThreeDMap.prototype.createCamera = function () {
        var fov = 45;
        this.camera = new THREE.PerspectiveCamera(
            fov,
            this.dim.width / this.dim.height,
            0.1,
            50000
        );
        // Some trig to find height for camera
        var cameraHeight;
        if (this.dim.Z) {
            cameraHeight = this.dim.Z;
        } else {
            cameraHeight = (this.dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
        }
        // Place camera in middle of bbox
        var centerX = (this.dim.minx + this.dim.maxx) / 2;
        var centerY = (this.dim.miny + this.dim.maxy) / 2;
        this.camera.position.set(centerX, centerY, cameraHeight);
    };

    ns.ThreeDMap.prototype.createControls = function () {
        this.controls = new THREE.TrackballControls(this.camera);
        // Point camera directly down
        var centerX = (this.dim.minx + this.dim.maxx) / 2;
        var centerY = (this.dim.miny + this.dim.maxy) / 2;
        this.controls.target = new THREE.Vector3(centerX, centerY, 0);
    };

    ns.ThreeDMap.prototype.render = function () {
        this.controls.update();
        window.requestAnimationFrame(this.render.bind(this));
        this.renderer.render(this.scene, this.camera);
    };

    ns.ThreeDMap.prototype.bbox2tiles = function (bounds) {
		var capabilitiesURL='http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?Version=1.0.0&service=wmts&request=getcapabilities';
		var client = new XMLHttpRequest();
		var tileMatrixSet={};
		var wmtsCalls=[];
		client.open('GET', capabilitiesURL);
		client.onreadystatechange = function() {
			if (this.readyState === 4) {
				// Start timing
				console.time('capabilities parsing');
				var capabilitiesText=client.responseText;
				var capabilitiesXml=txt2xml(capabilitiesText);
				tileMatrixSet=parseCapabilities(capabilitiesXml);

				var querySpanX=bounds.maxx-bounds.minx;
				var querySpanY=bounds.maxy-bounds.miny;
				var querySpanMin;
				var querySpanMinDim;
			
				if (querySpanX>querySpanY){
					querySpanMin=querySpanY;
					querySpanMinDim='y';
				}
				else{
					querySpanMin=querySpanX;
					querySpanMinDim='x';
				}
				var tileMatrixCount=tileMatrixSet.length;
				var activeMatrix;
				// Here we find the first matrix that has a tilespan smaller than that of the smallest dimension of the input bbox.
				// We can control the resolution of the images by altering how large a difference there must be (half, quarter etc.)
				for (var tileMatrix=0; tileMatrix < tileMatrixCount; tileMatrix++){
					if(querySpanMinDim='x')
						if (tileMatrixSet[tileMatrix].TileSpanX<querySpanMin){
							activeMatrix=tileMatrixSet[tileMatrix];
							break;
						}
					else
						if (tileMatrixSet[tileMatrix].TileSpanX<querySpanMin){
							activeMatrix=tileMatrixSet[tileMatrix];
							break;
						}
				}

	            var tileColMin=Math.floor((bounds.minx-activeMatrix.TopLeftCorner.minx)/activeMatrix.TileSpanX);
    	        var tileRowMin=Math.floor((activeMatrix.TopLeftCorner.maxy-bounds.maxy)/activeMatrix.TileSpanY);
        	    var tileColMax=Math.floor((bounds.maxx-activeMatrix.TopLeftCorner.minx)/activeMatrix.TileSpanX);
            	var tileRowMax=Math.floor((activeMatrix.TopLeftCorner.maxy-bounds.miny)/activeMatrix.TileSpanY);

				// Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
				for (var tc=tileColMin;tc<=tileColMax;tc++){
					for (var tr=tileRowMin;tr<=tileRowMax;tr++){
						wmtsCalls.push({
							tileRow: tr,
							tileCol: tc,
							url: {
								wmts: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&Layer=norges_grunnkart&Style=default&Format=image/png&TileMatrixSet=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&TileMatrix='+activeMatrix.Identifier+'&TileRow='+tr+'&TileCol='+tc,
								wms: '' 
							},
							bounds: {
								minx: activeMatrix.TopLeftCorner.minx+(tc*activeMatrix.TileSpanX),
								miny: activeMatrix.TopLeftCorner.maxy-((tr+1)*activeMatrix.TileSpanY),
								maxx: activeMatrix.TopLeftCorner.minx+((tc+1)*activeMatrix.TileSpanX),
								maxy: activeMatrix.TopLeftCorner.maxy-((tr)*activeMatrix.TileSpanY)
							}
						});
					}
				}
			console.log(wmtsCalls);
			return wmtsCalls;
    		}
			
		}
		client.send();

        // Proof of concept with 2 subdivision in each dimension:


	    this.tiles = [];

        //0,0
        this.tiles.push(
            new WCSTile(this.dim, 'x0_y0', {
                minx: bounds.minx,
                miny: bounds.miny,
                maxx: (bounds.minx + bounds.maxx) / 2,
                maxy: (bounds.miny + bounds.maxy) / 2
            }).load(this.tileLoaded.bind(this))
        );

        //1,0
        this.tiles.push(
            new WCSTile(this.dim, 'x1_y0', {
                minx: (bounds.minx + bounds.maxx) / 2,
                miny: bounds.miny,
                maxx: bounds.maxx,
                maxy: (bounds.miny + bounds.maxy) / 2
            }).load(this.tileLoaded.bind(this))
        );

        //0,1
        this.tiles.push(
            new WCSTile(this.dim, 'x0_y1', {
                minx: bounds.minx,
                miny: (bounds.miny + bounds.maxy) / 2,
                maxx: (bounds.minx + bounds.maxx) / 2,
                maxy: bounds.maxy
            }).load(this.tileLoaded.bind(this))
        );

        //1,1
        this.tiles.push(
            new WCSTile(this.dim, 'x1_y1', {
                minx: (bounds.minx + bounds.maxx) / 2,
                miny: (bounds.miny + bounds.maxy) / 2,
                maxx: bounds.maxx,
                maxy: bounds.maxy
            }).load(this.tileLoaded.bind(this))
        );

    };

    ns.ThreeDMap.prototype.tileLoader = function (wmtsCalls) {
        this.tiles = [];
		for (var i = 0; i<wmtsCalls.length;i++){	
			this.tiles.push(
	            new WCSTile(this.dim, wmtsCalls[i].tileCol+'_'+wmtsCalls[i].tileRow, {
        	        minx: wmtsCalls[i].bounds.minx,
                	miny: wmtsCalls[i].bounds.miny,
	                maxx: wmtsCalls[i].bounds.maxx,
        	        maxy: wmtsCalls[i].bounds.maxy
	            }).load(this.tileLoaded.bind(this))
			)
		};
    };
    ns.ThreeDMap.prototype.tileLoaded = function (tile) {
        this.scene.add(tile.plane);
        this.render();
    };

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

    ns.Dim = {
        width: window.innerWidth,
        height: window.innerHeight,
        demWidth: getQueryVariable("WIDTH") || 100,
        demHeight: getQueryVariable("HEIGHT") || 100,
        bbox: getQueryVariable("BBOX") || '161244,6831251,171526,6837409',
        metersWidth: 0,
        metersHeight: 0,
        minx: 0,
        maxx: 0,
        miny: 0,
        maxy: 0,
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
        crs: getQueryVariable("CRS") || getQueryVariable("SRS") || 'EPSG:32633',
        coverage: getQueryVariable("COVERAGE") || 'land_utm33_10m',
        wmsUrl: getQueryVariable("WMS") || 'http://openwms.statkart.no/skwms1/wms.topo2',
        wcsUrl: 'http://openwms.statkart.no/skwms1/wcs.dtm',
        wmsMult: getQueryVariable("WMSMULT") || 5,
        wmsFormat: getQueryVariable("WMSFORMAT") || "image/png",
        wmsFormatMode: "",
        zMult: getQueryVariable("ZMULT")||1,
        Z: getQueryVariable("Z") || null,
        proportionWidth: 0,
        proportionHeight: 0
    };

    var dim = ns.Dim.init();
    var wmsLayers = getQueryVariable("LAYERS") || layers;
    var threeDMap = new ns.ThreeDMap(wmsLayers, dim);

    function parseCapabilities(capabilitiesXml) {
	var tileMatrixSetDict=[];
	var pixelsize=0.00028;
	var layers=capabilitiesXml.getElementsByTagName("Layer");
	//TODO: This fetches tileMatrixes we don't need: 
	var tileMatrixSets=capabilitiesXml.getElementsByTagName("TileMatrixSet");
	var layersCount=layers.length;
	// Iterate through all layers
	for (var layer=0; layer<layersCount; layer++) {
		//Check for layer specified
		//TODO: should be evaluated against wxs url-parameters
		if (layers[layer].getElementsByTagName('Identifier')[0].innerHTML=='topo2'){
			var activeLayer=layers[layer];
			var layerTileMatrixSets=activeLayer.getElementsByTagName('TileMatrixSetLink');
			var layerTileMatrixCount=layerTileMatrixSets.length;
			// Iterate through all tilematrixsets allowed for layer
			for (var layerTileMatrix=0; layerTileMatrix<layerTileMatrixCount; layerTileMatrix++){
				//Check for specified crs
				//TODO: should be evaluated against wxs url-parameters
				if (layerTileMatrixSets[layerTileMatrix].getElementsByTagName('TileMatrixSet')[0].innerHTML=='EPSG:32633'){
					//console.log(layerTileMatrixSets[layerTileMatrix].getElementsByTagName('TileMatrixSet')[0].innerHTML);
					var tileMatrixSetsCount=tileMatrixSets.length;
					// We've now verified that the specified layer supports the specified crs. Time to fetch the actual tilematrixset
					for (var tileMatrixSet=0; tileMatrixSet<tileMatrixSetsCount; tileMatrixSet++)
					{
						// Neccessary hack since we fetch too many tilematrixes
						if(tileMatrixSets[tileMatrixSet].getElementsByTagName('Identifier').length >0){
							//Check for specified crs
							if (tileMatrixSets[tileMatrixSet].getElementsByTagName('Identifier')[0].innerHTML=='EPSG:32633'){
								var tileMatrix=tileMatrixSets[tileMatrixSet].getElementsByTagName('TileMatrix');
								var tileMatrixCount=tileMatrix.length;
								// Iterate through all matrixes for crs
								for (var tileMatrixIndex=0;tileMatrixIndex<tileMatrixCount; tileMatrixIndex++){
									tileMatrixSetDict.push({
										Identifier: tileMatrix[tileMatrixIndex].getElementsByTagName('Identifier')[0].innerHTML,
										ScaleDenominator: parseFloat(tileMatrix[tileMatrixIndex].getElementsByTagName('ScaleDenominator')[0].innerHTML),
										TopLeftCorner: { 
											minx: parseFloat(tileMatrix[tileMatrixIndex].getElementsByTagName('TopLeftCorner')[0].innerHTML.split(' ')[0]) ,
											maxy: parseFloat(tileMatrix[tileMatrixIndex].getElementsByTagName('TopLeftCorner')[0].innerHTML.split(' ')[1]) ,
										},
										TileWidth: parseInt(tileMatrix[tileMatrixIndex].getElementsByTagName('TileWidth')[0].innerHTML),
										TileHeight: parseInt(tileMatrix[tileMatrixIndex].getElementsByTagName('TileHeight')[0].innerHTML),
										MatrixWidth: parseInt(tileMatrix[tileMatrixIndex].getElementsByTagName('MatrixWidth')[0].innerHTML),
										MatrixHeight: parseInt(tileMatrix[tileMatrixIndex].getElementsByTagName('MatrixHeight')[0].innerHTML),
										TileSpanX: parseFloat(tileMatrix[tileMatrixIndex].getElementsByTagName('ScaleDenominator')[0].innerHTML*pixelsize)*tileMatrix[tileMatrixIndex].getElementsByTagName('TileWidth')[0].innerHTML,
										TileSpanY: parseFloat(tileMatrix[tileMatrixIndex].getElementsByTagName('ScaleDenominator')[0].innerHTML*pixelsize)*tileMatrix[tileMatrixIndex].getElementsByTagName('TileHeight')[0].innerHTML
									});
								}
								console.timeEnd('capabilities parsing');
							}
						}
					}
				}
			}
		}
	}
	return tileMatrixSetDict;
    }
    function txt2xml(xmltxt) {
	if(window.DOMParser){
	    // non i.e. browser
	    var xmlparser = new DOMParser();
	    var xmlDoc = xmlparser.parseFromString(xmltxt, "text/xml");
	}else{
	    // i.e. browser 
	    var xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
	    xmlDoc.async = false;
	    xmlDoc.loadXML(xmltxt);
}
return xmlDoc;
};
}(wxs3));
