var wxs3 = wxs3 || {};

(function () {
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
            geometry.vertices[i].z = line[2];
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

    var Wxs3 = function (layers, dim) {

        this.dim = dim;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;

        if (dim.metersWidth > dim.metersHeight) {
            var widthHeightRatio = dim.metersWidth / dim.metersHeight;
            dim.demWidth = parseInt(widthHeightRatio * dim.demWidth, 10);
        } else if (dim.metersWidth < dim.metersHeight) {
            var heightWidthRatio = dim.metersHeight / dim.metersWidth;
            dim.demHeight = parseInt(heightWidthRatio * dim.demHeight, 10);
        }

        // mapunits between vertexes in x-dimention
        dim.proportionWidth = dim.metersWidth / dim.demWidth;

        // mapunits between vertexes in y-dimention
        dim.proportionHeight = dim.metersHeight / dim.demHeight;

        // average mapunits between vertexes
        var proportionAverage = ((dim.proportionWidth + dim.proportionHeight) / 2);

        if (dim.zInv) {
            proportionAverage *= -1;
        }
        if (dim.zMult) {
            dim.zMult = proportionAverage / dim.zMult;
        } else {
            dim.zMult = proportionAverage;
        }

        this.dim.wmsLayers = layers;

        this.createRenderer();
        this.createScene();
        this.createCamera();
        this.createControls();

        // Generate tiles and boundingboxes
        this.bbox2tiles(this.dim.getBounds());
        document.getElementById('webgl').appendChild(this.renderer.domElement);
    };

    Wxs3.prototype.createRenderer = function () {
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.dim.width, this.dim.height);
    };

    Wxs3.prototype.createScene = function () {
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xeeeeee));
    };

    Wxs3.prototype.createCamera = function () {
        var fov = 45;
        this.camera = new THREE.PerspectiveCamera(
            fov,
            this.dim.width / this.dim.height,
            0.1,
            20000
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

    Wxs3.prototype.createControls = function () {
        this.controls = new THREE.TrackballControls(this.camera);
        // Point camera directly down
        var centerX = (this.dim.minx + this.dim.maxx) / 2;
        var centerY = (this.dim.miny + this.dim.maxy) / 2;
        this.controls.target = new THREE.Vector3(centerX, centerY, 0);
    };

    Wxs3.prototype.render = function () {
        this.controls.update();
        window.requestAnimationFrame(this.render.bind(this));
        this.renderer.render(this.scene, this.camera);
    };

    Wxs3.prototype.bbox2tiles = function (bounds) {
        //TODO: generic tilematrix-parsing
        // Proof of concept with 2 subdivision in each dimention:

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

    Wxs3.prototype.tileLoaded = function (tile) {
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

    var dim = {
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
            this.metersWidth = [2] - splitBbox[0];
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
        zInv: getQueryVariable("ZINV") || false,
        zMult: getQueryVariable("ZMULT"),
        Z: getQueryVariable("Z") || null,
        proportionWidth: 0,
        proportionHeight: 0
    }.init();

    var wmsLayers = getQueryVariable("LAYERS") || layers;
    var wxs3 = new Wxs3(wmsLayers, dim);

}());