var wxs3 = wxs3 || {};

(function () {

    'use strict';

    //check WebGL
    if (!window.WebGLRenderingContext) {
        // the browser doesn't even know what WebGL is
        window.location = "http://get.webgl.org";
    }

    var camera, scene, renderer, controls;

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

    function render() {
        controls.update();
        requestAnimationFrame(render);
        renderer.render(scene, camera);
    }

    function createMaterial(bboxWMS, tileNr, wmsLayers) {
        var material = new THREE.MeshPhongMaterial(
            {
                map: THREE.ImageUtils.loadTexture(
                    dim.wms + '?' +
                        'service=wms' +
                        '&version=1.3.0' +
                        '&request=getmap' +
                        '&crs=' + dim.crs +
                        '&srs=' + dim.crs +
                        '&WIDTH=' + dim.demWidth * dim.wmsMult +
                        '&HEIGHT=' + dim.demHeight * dim.wmsMult +
                        '&bbox=' + bboxWMS +
                        '&layers=' + layers +
                        '&format=' + dim.wmsFormat + dim.wmsFormatMode,
                    new THREE.UVMapping()
                )
            }
        );
        material.name = 'material_' + tileNr;
        return material;
    }

    function demTileLoaded(tileNr, minx, miny, maxx, maxy, responseText, wmsLayers) {

        var minxWMS, minyWMS, maxxWMS, maxyWMS;
        var geometry = new THREE.PlaneGeometry(
            maxx - minx,
            maxy - miny,
            (dim.demWidth - 1),
            (dim.demHeight - 1)
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
            createMaterial(bboxWMS, tileNr, wmsLayers)
        );
        plane.name = 'tile_' + tileNr;
        scene.add(plane);

        dim.tilesFinished += 1;
        render();

        console.log('rendering bbox ' + bboxWMS);
        console.log('nr of finished geom: ' + dim.tilesFinished);
    }

    function addTile(tileNr, minx, miny, maxx, maxy, wmsLayers) {

        var bboxWCS = [
            parseInt(minx, 10),
            parseInt(miny - dim.proportionHeight, 10),
            parseInt(maxx + dim.proportionWidth, 10),
            parseInt(maxy, 10)
        ].join(',');

        var url = 'http://openwms.statkart.no/skwms1/wcs.dtm?' +
            'SERVICE=WCS' +
            '&VERSION=1.0.0' +
            '&REQUEST=GetCoverage' +
            '&FORMAT=XYZ' +
            '&COVERAGE=' + dim.coverage +
            '&bbox=' + bboxWCS +
            '&CRS=' + dim.crs +
            '&RESPONSE_CRS=' + dim.crs +
            '&WIDTH=' + parseInt(dim.demWidth, 10) +
            '&HEIGHT=' + parseInt(dim.demHeight, 10);

        var demTileRequest = new XMLHttpRequest();
        demTileRequest.open('GET', url, true);

        demTileRequest.onreadystatechange = function () {
            if (this.readyState === 4) {
                demTileLoaded(tileNr, minx, miny, maxx, maxy, this.responseText, wmsLayers);
            }
        };
        demTileRequest.send();
    }


    function bbox2tiles(minx, miny, maxx, maxy, wmsLayers) {
        //TODO: generic tilematrix-parsing

        // Proof of concept with 2 subdivision in each dimention:
        //0,0
        addTile('x0_y0', minx, miny, (minx + maxx) / 2, (miny + maxy) / 2, wmsLayers);
        //1,0
        addTile('x1_y0', (minx + maxx) / 2, miny, maxx, (miny + maxy) / 2, wmsLayers);
        //0,1
        addTile('x0_y1', minx, (miny + maxy) / 2, (minx + maxx) / 2, maxy, wmsLayers);
        //1,1
        addTile('x1_y1', (minx + maxx) / 2, (miny + maxy) / 2, maxx, maxy, wmsLayers);

    }

    wxs3.init = function () {
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
        var wmsLayers = getQueryVariable("LAYERS") || layers;

        renderer = new THREE.WebGLRenderer();
        renderer.setSize(dim.width, dim.height);

        scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xeeeeee));

        fov = 45;
        camera = new THREE.PerspectiveCamera(fov, dim.width / dim.height, 0.1, 20000);
        // Some trig to find height for camera
        cameraHeight = getQueryVariable("Z") || (dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
        // Place camera in middle of bbox
        camera.position.set((dim.minx + dim.maxx) / 2, (dim.miny + dim.maxy) / 2, cameraHeight);
        controls = new THREE.TrackballControls(camera);
        // Point camera directly down
        controls.target = new THREE.Vector3((dim.minx + dim.maxx) / 2, (dim.miny + dim.maxy) / 2, 0);

        // Generate tiles and boundingboxes
        bbox2tiles(dim.minx, dim.miny, dim.maxx, dim.maxy, wmsLayers);
        document.getElementById('webgl').appendChild(renderer.domElement);
    };

    wxs3.init();

}());