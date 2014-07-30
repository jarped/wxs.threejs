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
                //Arbitrary value added and subtracted to include heights along border. 
                //TODO: Needs a precise fix
                this.wmtsCall.bounds.minx,
                this.wmtsCall.bounds.miny - (this.wmtsCall.tileSpanY/this.dim.demWidth),
                this.wmtsCall.bounds.maxx + (this.wmtsCall.tileSpanX/this.dim.demHeight),
                this.wmtsCall.bounds.maxy
        ].join(',')
    };

    WCSTile.prototype.load = function (callback, wmtsCall) {
        this.callback = callback;
        this.wmtsCall=wmtsCall;
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
            this.wmtsCall.bounds.maxx - this.wmtsCall.bounds.minx,
            this.wmtsCall.bounds.maxy - this.wmtsCall.bounds.miny,
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
        //TODO: change this to WMTS. For now we can use wms-calls to a cache
        var params = {
            service: 'wms',
            version: '1.3.0',
            request: 'getmap',
            crs: this.dim.crs,
            srs: this.dim.crs,
            // Set these to 256, but should be variables as this only works when using cache. We should also allow wms.
            WIDTH: 256,
            HEIGHT: 256,
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

        // Setting demWidth and demHeight to something that multiplies into 256
        dim.demWidth=64;
        dim.demHeight=64;

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
        document.getElementById('webgl').appendChild(this.renderer.domElement);
    };

    ns.ThreeDMap.prototype.createRenderer = function () {
        // Canvasrenderer + material.overdra1=1.0 will fix gaps. Unfortunately waaaay too slow for pur use.
        //this.renderer = new THREE.CanvasRenderer();
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
        var that = this;
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
						var minx=activeMatrix.TopLeftCorner.minx+(tc*activeMatrix.TileSpanX);
						var miny=activeMatrix.TopLeftCorner.maxy-((tr+1)*activeMatrix.TileSpanY);
						var maxx=activeMatrix.TopLeftCorner.minx+((tc+1)*activeMatrix.TileSpanX);
						var maxy=activeMatrix.TopLeftCorner.maxy-((tr)*activeMatrix.TileSpanY);
						wmtsCalls.push({
                            tileSpanX: activeMatrix.TileSpanX,
                            tileSpanY: activeMatrix.TileSpanY,
							tileRow: tr,
							tileCol: tc,
                            // Setting these for easy debugging
							url: {
								cache_wmts: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&Layer=topo2&Style=default&Format=image/png&TileMatrixSet=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&TileMatrix='+activeMatrix.Identifier+'&TileRow='+tr+'&TileCol='+tc,
                                cache_wms: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&Layer=topo2&Style=default&Format=image/png&width=256&height=256&crs=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+ minx + ',' + miny + ',' + maxx + ',' + maxy ,
								wms: 'http://openwms.statkart.no/skwms1/wms.topo2?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&Layers=topo2_wms&Style=default&Format=image/png&WIDTH=256&HEIGHT=256&SRS=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+ minx + ',' + miny + ',' + maxx + ',' + maxy 
							},
							bounds: {
								minx: minx,
								miny: miny,
								maxx: maxx,
								maxy: maxy 
							}
						});
					}
				}
            that.tileLoader(wmtsCalls);
    		}
			
		}
		client.send();
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
	            }).load(this.tileLoaded.bind(this), wmtsCalls[i])
			)
		};
    };
    ns.ThreeDMap.prototype.tileLoaded = function (tile) {
        //This can be used with CanvasRenderer to fix gaps.
        //tile.plane.material.overdraw=0.5;
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
        // Hacky namespace-resolver to read default namespace. suggestions welcome
        var resolver = {
                        lookupNamespaceURI: function lookup(aPrefix) {
                            if (aPrefix == "default") {
                                return capabilitiesXml.documentElement.namespaceURI;
                            }
                            else if(aPrefix == 'ows') {
                                return 'http://www.opengis.net/ows/1.1';
                            }
                        }
                    }

        //TODO: Find layers from capabilities and check if crs is supported by layer. Example xpath:
        //var iterator=capabilitiesXml.evaluate("//default:Capabilities/default:Contents/default:Layer[child::ows:Identifier[text()='topo2']]",capabilitiesXml, resolver,XPathResult.ANY_TYPE, null);

        // Find tilematrixset:
        var iterator=capabilitiesXml.evaluate("//default:Capabilities/default:Contents/default:TileMatrixSet[child::ows:Identifier[text()='EPSG:32633']]/default:TileMatrix",capabilitiesXml, resolver,XPathResult.ANY_TYPE, null);
        try {
          var thisNode = iterator.iterateNext();
          
          while (thisNode) {
            tileMatrixSetDict.push({
                Identifier: thisNode.childNodes[3].textContent,
                ScaleDenominator: parseFloat(thisNode.childNodes[5].textContent),
                TopLeftCorner: { 
                    minx: parseFloat(thisNode.childNodes[7].textContent.split(' ')[0]) ,
                    maxy: parseFloat(thisNode.childNodes[7].textContent.split(' ')[1]) ,
                },
                TileWidth: parseInt(thisNode.childNodes[9].textContent),
                TileHeight: parseInt(thisNode.childNodes[11].textContent),
                MatrixWidth: parseInt(thisNode.childNodes[13].textContent),
                MatrixHeight: parseInt(thisNode.childNodes[15].textContent),
                TileSpanX: parseFloat((thisNode.childNodes[5].textContent*pixelsize)*thisNode.childNodes[9].textContent),
                TileSpanY: parseFloat((thisNode.childNodes[5].textContent*pixelsize)*thisNode.childNodes[11].textContent)
            });
            thisNode = iterator.iterateNext();
          } 
        }
        catch (e) {
          console.log( 'Error: An error occured during iteration ' + e );
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
