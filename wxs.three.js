var wxs3 = wxs3 || {};

(function () {
    'use strict';

    //check WebGL
    if (!window.WebGLRenderingContext) {
        // the browser doesn't even know what WebGL is
        window.location = "http://get.webgl.org";
    }

    // extraction for URL parameters
    function getQueryVariable(variable) {
        var pair,
            i,
            vars,
            query;
        console.log("getQueryVariable :" + variable);

        query = window.location.search.substring(1);
        vars = query.split("&");
        for (i = 0; i < vars.length; i++) {
            pair = vars[i].split("=");
            if (pair[0].toUpperCase() === variable) {
                return pair[1];
            }
        }
        return false;
    }

    var Wxs3 = function (layers, dim) {

        this.dim = dim;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;

        var cameraHeight, fov, proportionAverage;

        if (dim.metersWidth > dim.metersHeight) {
            dim.demWidth = parseInt((dim.metersWidth / dim.metersHeight) * dim.demWidth, 10);
        } else if (dim.metersWidth < dim.metersHeight) {
            dim.demHeight = parseInt((dim.metersHeight / dim.metersWidth) * dim.demHeight, 10);
        }

        dim.proportionWidth = dim.metersWidth / dim.demWidth; // mapunits between vertexes in x-dimention
        dim.proportionHeight = dim.metersHeight / dim.demHeight; // mapunits between vertexes in y-dimention
        proportionAverage = ((dim.proportionWidth + dim.proportionHeight) / 2); // average mapunits between vertexes

        if (dim.zInv) {
            proportionAverage *= -1;
        }
        if (dim.zMult) {
            dim.zMult = proportionAverage / dim.zMult;
        } else {
            dim.zMult = proportionAverage;
        }

        if (getQueryVariable("WMSFORMATMODE")) {
            dim.wmsFormatMode = '; mode=' + getQueryVariable("WMSFORMATMODE");
        }

        // We've defined some standardlayers for the default wms-service in topo2.layers.js. Overwrite them if defined in url.
        this.wmsLayers = getQueryVariable("LAYERS") || layers;

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(dim.width, dim.height);

        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xeeeeee));

        fov = 45;
        this.camera = new THREE.PerspectiveCamera(fov, dim.width / dim.height, 0.1, 20000);
        // Some trig to find height for camera
        cameraHeight = getQueryVariable("Z") || (dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
        // Place camera in middle of bbox
        this.camera.position.set((dim.minx + dim.maxx) / 2, (dim.miny + dim.maxy) / 2, cameraHeight);
        this.controls = new THREE.TrackballControls(this.camera);
        // Point camera directly down
        this.controls.target = new THREE.Vector3((dim.minx + dim.maxx) / 2, (dim.miny + dim.maxy) / 2, 0);

        // Generate tiles and boundingboxes
        this.bbox2tiles(dim.minx, dim.miny, dim.maxx, dim.maxy);
        document.getElementById('webgl').appendChild(this.renderer.domElement);
    };

    Wxs3.prototype.render = function () {
        this.controls.update();
        requestAnimationFrame(this.render.bind(this));
        this.renderer.render(this.scene, this.camera);
    };

    Wxs3.prototype.bbox2tiles = function (minx, miny, maxx, maxy) {
        //TODO: generic tilematrix-parsing
        // Proof of concept with 2 subdivision in each dimention:
        //0,0
        this.addTile('x0_y0', minx, miny, (minx + maxx) / 2, (miny + maxy) / 2);
        //1,0
        this.addTile('x1_y0', (minx + maxx) / 2, miny, maxx, (miny + maxy) / 2);
        //0,1
        this.addTile('x0_y1', minx, (miny + maxy) / 2, (minx + maxx) / 2, maxy);
        //1,1
        this.addTile('x1_y1', (minx + maxx) / 2, (miny + maxy) / 2, maxx, maxy);
    };

    Wxs3.prototype.addTile = function (tileNr, minx, miny, maxx, maxy) {

        var bboxWCS = [
            parseInt(minx, 10),
            parseInt(miny - this.dim.proportionHeight, 10),
            parseInt(maxx + this.dim.proportionWidth, 10),
            parseInt(maxy, 10)
        ].join(',');

        var url = 'http://openwms.statkart.no/skwms1/wcs.dtm?' +
            'SERVICE=WCS' +
            '&VERSION=1.0.0' +
            '&REQUEST=GetCoverage' +
            '&FORMAT=XYZ' +
            '&COVERAGE=' + this.dim.coverage +
            '&bbox=' + bboxWCS +
            '&CRS=' + this.dim.crs +
            '&RESPONSE_CRS=' + this.dim.crs +
            '&WIDTH=' + parseInt(this.dim.demWidth, 10) +
            '&HEIGHT=' + parseInt(this.dim.demHeight, 10);

        var demTileRequest = new XMLHttpRequest();
        demTileRequest.open('GET', url, true);

        var that = this;
        demTileRequest.onreadystatechange = function () {
            if (this.readyState === 4) {
                that.demTileLoaded(tileNr, minx, miny, maxx, maxy, this.responseText);
            }
        };
        demTileRequest.send();
    };

    Wxs3.prototype.demTileLoaded = function (tileNr, minx, miny, maxx, maxy, responseText) {

        var minxWMS, minyWMS, maxxWMS, maxyWMS;
        var geometry = new THREE.PlaneGeometry(
            maxx - minx,
            maxy - miny,
            (this.dim.demWidth - 1),
            (this.dim.demHeight - 1)
        );

        var i, l;
        var lines = responseText.split("\n");
        for (i = 0, l = geometry.vertices.length; i < l; i++) {
            geometry.vertices[i].x = lines[i].split(' ')[0];
            geometry.vertices[i].y = lines[i].split(' ')[1];
            geometry.vertices[i].z = lines[i].split(' ')[2];
            if (i === 0) {
                minxWMS = geometry.vertices[i].x;
                maxyWMS = geometry.vertices[i].y;
            }
            if (i === l - 1) {
                maxxWMS = geometry.vertices[i].x;
                minyWMS = geometry.vertices[i].y;
            }
        }
        var bboxWMS = [minxWMS, minyWMS, maxxWMS, maxyWMS].join(',');

        var plane = new THREE.Mesh(
            geometry,
            this.createMaterial(bboxWMS, tileNr)
        );
        plane.name = 'tile_' + tileNr;
        this.scene.add(plane);

        this.dim.tilesFinished += 1;
        this.render();

        console.log('rendering bbox ' + bboxWMS);
        console.log('nr of finished geom: ' + this.dim.tilesFinished);
    };

    Wxs3.prototype.createMaterial = function (bboxWMS, tileNr) {
        var material = new THREE.MeshPhongMaterial(
            {
                map: THREE.ImageUtils.loadTexture(
                    this.dim.wms + '?' +
                        'service=wms' +
                        '&version=1.3.0' +
                        '&request=getmap' +
                        '&crs=' + this.dim.crs +
                        '&srs=' + this.dim.crs +
                        '&WIDTH=' + this.dim.demWidth * this.dim.wmsMult +
                        '&HEIGHT=' + this.dim.demHeight * this.dim.wmsMult +
                        '&bbox=' + bboxWMS +
                        '&layers=' + this.wmsLayers +
                        '&format=' + this.dim.wmsFormat + this.dim.wmsFormatMode,
                    new THREE.UVMapping()
                )
            }
        );
        material.name = 'material_' + tileNr;
        return material;
    };

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
        tilesFinished: 0,
        tilesTotal: 4,
        init: function () {
            this.metersWidth = this.bbox.split(',')[2] - this.bbox.split(',')[0];
            this.metersHeight = this.bbox.split(',')[3] - this.bbox.split(',')[1];
            this.minx = parseInt(this.bbox.split(',')[0], 10);
            this.maxx = parseInt(this.bbox.split(',')[2], 10);
            this.miny = parseInt(this.bbox.split(',')[1], 10);
            this.maxy = parseInt(this.bbox.split(',')[3], 10);
            return this;
        },
        crs: getQueryVariable("CRS") || getQueryVariable("SRS") || 'EPSG:32633',
        coverage: getQueryVariable("COVERAGE") || 'land_utm33_10m',
        wms: getQueryVariable("WMS") || 'http://openwms.statkart.no/skwms1/wms.topo2',
        wmsMult: getQueryVariable("WMSMULT") || 5,
        wmsFormat: getQueryVariable("WMSFORMAT") || "image/png",
        wmsFormatMode: "",
        zInv: getQueryVariable("ZINV") || false,
        zMult: getQueryVariable("ZMULT"),
        proportionWidth: 0,
        proportionHeight: 0
    }.init();

    var wxs3 = new Wxs3(layers, dim);

}());