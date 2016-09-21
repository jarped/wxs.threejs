import {
    WebGLRenderer,
    Scene,
    AmbientLight,
    PerspectiveCamera,
    PlaneGeometry,
    TextureLoader,
    LinearFilter,
    MeshPhongMaterial,
    DoubleSide,
    Mesh
} from 'three';

import {
    Line,
    LineBasicMaterial,
    Geometry,
    Vector3
} from 'three';

import TrackballControls from 'three.trackball';
import * as _ from 'underscore';
import TIFFParser from './../tiff-js/tiff.js';

import createQueryString from './util/createQueryString';
import clampLineString from './clampLineString';
import events from './util/events';
import toUtm33 from './util/toUtm33';

var ThreeDMapUntiled = function (dim) {
    this.dim = dim;
    this.events = events();
};

ThreeDMapUntiled.prototype.on = function (event, callback, context) {
    this.events.on(event, callback, context);
};

ThreeDMapUntiled.prototype.init = function () {
    this.reloadTimer = -1;
    this.height = [];
    this.midHeight = null;

    this.renderer = this.createRenderer();
    this._camera =   this.createCamera();
    this.controls = this.createControls();
    this.geometry = this.createGeometry();

    this.material = this.createMaterial();

    //Create Mesh and Scene
    this.mesh = this.createMesh(this.geometry, this.material);
    this.scene = this.createScene(this.mesh);

    //Add webgl canvas to div
    this.dim.div.appendChild(this.renderer.domElement);

    //Start renderer and listen to changes in geometry
    this.render();

    //Load height model and texture asynchronously
    this.events.fire('onTerrainLoadStart');
    this.loadTerrain();
    this.events.fire('onTextureLoadStart');
    this.loadTexture(this.material);

    //Adust canvas if container is resized
    window.addEventListener('resize', this.resizeMe.bind(this), false);
    this.on('onTextureLoadEnd', this._clampLines, this);
};

ThreeDMapUntiled.prototype.createRenderer = function () {
    var renderer = new WebGLRenderer({
        alpha: true
    });
    renderer.setSize(this.dim.width, this.dim.height);
    return renderer;
};

ThreeDMapUntiled.prototype.createScene = function (mesh) {  
    var scene = new Scene();
    //Ambient Light for MeshPhongMaterial
    scene.add(new AmbientLight(0xffffff));
    scene.add(mesh);
    return scene;
};

ThreeDMapUntiled.prototype.createCamera = function () {
    var fov = 45,
        cameraHeight;

    var camera = new PerspectiveCamera(
        fov,
        this.dim.width / this.dim.height,
        0.1,
        1000
    );

    // Some trig to find height for camera
    if (!!this.dim.Z) {
        cameraHeight = this.dim.Z;
    } else {
        //Adapt optimal side length according to canvas
        var sideLength;
        var canvCoefficient = this.dim.width / this.dim.height;
        if (canvCoefficient < (this.dim.demWidth/this.dim.demHeight)){
            sideLength = this.dim.demWidth / canvCoefficient;
        } else {
            sideLength = this.dim.demHeight;
        }

        //calculate camera height
        cameraHeight = (sideLength / 2) / Math.tan((fov / 2) * Math.PI / 180);
    }

    camera.position.set(0, 0, cameraHeight);
    return camera;
};

ThreeDMapUntiled.prototype.createGeometry = function (){
    return new PlaneGeometry(
        this.dim.demWidth,
        this.dim.demHeight,
        this.dim.demWidth - 1,
        this.dim.demHeight - 1
    );
};

ThreeDMapUntiled.prototype.getImageMap = function (){
    var imageCall;
    var texture = this.dim.config.texture;
    if (texture.imgUrl) { //IMAGE
        return texture.imgUrl;
    }
    var params = {
        service: 'wms',
        version: '1.3.0',
        request: 'getMap',
        crs: this.dim.crs,
        WIDTH: this.dim.imgWidth,
        HEIGHT: this.dim.imgHeight,
        bbox: this.dim.envelope.join(','),
        layers: texture.wmsLayers,
        format: texture.wmsFormat + texture.wmsFormatMode
    };
    return texture.wmsUrl + '?' + createQueryString(params);
};

ThreeDMapUntiled.prototype.loadTexture = function (material){

    var loader = new TextureLoader(),
        image = this.getImageMap(),
        _this = this;
    var events = this.events;
    // load a resource
    loader.load(
        image,
        function (texture) {
            //Texture is probably not the power of two.
            //Avoid warning: Apply THREE.LinearFilter or THREE.NearestFilter
            texture.minFilter = LinearFilter;

            //Set texture in material which needs updating
            material.map = texture;
            material.needsUpdate = true;
        },
        // Function called when download progresses
        function (xhr) {
            if (xhr.loaded === xhr.total) {
                events.fire('onTextureLoadEnd');
            }
        },
        // Function called when download errors
        function (xhr) {
            console.log( 'An error happened on texture load: ' + image );
        }
    );
};

ThreeDMapUntiled.prototype.terrainLoaded = function (xhr) {
    var isTiff = this.dim.config.terrain.format === 'geotiff';
    var lines;
    var minHeight = 10000,
        maxHeight = -10000;

    var tiffParser, tiffArray;
    if (isTiff){//geotiff
        tiffParser = new TIFFParser();
        tiffArray = tiffParser.parseTIFF(xhr.response);
        lines = tiffArray;
    } else {//ZYZ
        lines = xhr.responseText.split('\n');
    }

    //loop trought heights and calculate midHeigth
    if (isTiff) { //geotiff
        var i = -1;
        for (var j = 0; j < lines.length; j++){
            for (var k = 0; k < lines[j].length;  k++){
                this.height[++i] = parseInt(lines[j][k][0], 10);//Number?
                if (this.height[i] < minHeight) {
                    minHeight = this.height[i];
                }
                else if (this.height[i] > maxHeight) {
                    maxHeight = this.height[i];
                }
            }
        }
    } else {//XYZ
        for (var i = 0, l = this.geometry.vertices.length; i < l; i++) {
            this.height[i] = parseInt(lines[i].split(' ')[2], 10);
            if (this.height[i] < minHeight) {
                minHeight = this.height[i];
            }
            else if (this.height[i] > maxHeight) {
                maxHeight = this.height[i];
            }
        }
    }

    //The Vertical center of the height model is adjusted to (min + max) / 2.
    //If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level,
    //a tipping of the model will cause the map to disappear over the screen top without this adjustment.
    //On a computer you can move the model down width a right-click-drag, but not on a mobile device.
    this.midHeight = (maxHeight + minHeight) / 2;

    //assign vertices and adjust z values according to _this.midHeight
    for (var i = 0, l = this.geometry.vertices.length; i < l; i++) {
        this.geometry.vertices[i].z = ((this.height[i] - this.midHeight) / this.dim.zMult);
    }

    this.geometry.loaded = true;
    this.geometry.verticesNeedUpdate = true;
    this.events.fire('onTerrainLoadEnd');
};

ThreeDMapUntiled.prototype.loadTerrain = function () {
    var terrain = this.dim.config.terrain;
    var isTiff = (terrain.format === 'geotiff'),
        demRequest = new XMLHttpRequest(),
        _this = this;

    var params = {
        SERVICE: 'WCS',
        VERSION: '1.0.0',
        REQUEST: 'GetCoverage',
        COVERAGE: terrain.coverage,
        FORMAT: terrain.format,
        bbox: this.dim.envelope.join(','),
        CRS: this.dim.crs,
        RESPONSE_CRS: this.dim.crs,
        WIDTH: this.dim.demWidth,
        HEIGHT: this.dim.demHeight
    };

    var wcsCall =  terrain.wcsUrl + '?' + createQueryString(params);
    if (isTiff) {
        demRequest.responseType = 'arraybuffer';
    }
    demRequest.open('GET', wcsCall, true);
    demRequest.onreadystatechange = function () {
        if (this.readyState === 4) {
            _this.terrainLoaded(this);
        }
    };
    demRequest.send();
};

ThreeDMapUntiled.prototype.createMaterial = function (){
    var material = new MeshPhongMaterial({ //for shading and Ambient Light
        side: DoubleSide
    });
    material.wireframe = this.dim.wireframe;
    return material;
};

ThreeDMapUntiled.prototype.createMesh = function (geometry, material) {  
    return new Mesh(geometry, material);
};

ThreeDMapUntiled.prototype.createControls = function () {
    return new TrackballControls(this._camera);
};

ThreeDMapUntiled.prototype.render = function () {
    this.controls.update();
    window.requestAnimationFrame(this.render.bind(this));
    this.renderer.render(this.scene, this._camera);
};

ThreeDMapUntiled.prototype.resizeMe = function (){
    window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(this.reloadAll.bind(this), 1000);
    return;
};

ThreeDMapUntiled.prototype.reloadAll = function (){
    this.dim.width = this.dim.div.clientWidth;
    this.dim.height = this.dim.div.clientHeight;

    this._camera.aspect =  this.dim.width / this.dim.height;
    this._camera.updateProjectionMatrix();

    delete(this.controls);
    this.controls = this.createControls();
    this.renderer.setSize(this.dim.width, this.dim.height);
};

function createLine(points, color) {
    var vertices = _.map(points, function (point) {
        return new Vector3(point.x, point.y, point.z);
    });

    var material = new LineBasicMaterial({
        color: color || 0x0000ff
    });
    var geometry = new Geometry();
    geometry.vertices = vertices;
    return new Line(geometry, material);
}

ThreeDMapUntiled.prototype.addLine = function (lineGeom) {

    if (lineGeom.type !== 'LineString') {
        throw new Error('Expected GeoJSON LineString geometry');
    }


    //get envelope stuff
    var coordMinX = this.dim.envelope[0];
    var coordMinY = this.dim.envelope[1];
    var coordWidth = this.dim.envelope[2] - coordMinX;
    var coordHeight = this.dim.envelope[3] - coordMinY;

    //get the bbox of the geometry
    this.geometry.computeBoundingBox();
    var bbox = this.geometry.boundingBox;

    var pixelMinX = bbox.min.x;
    var pixelMinY = bbox.min.y;
    var pixelWidth = Math.abs(bbox.max.x - pixelMinX);
    var pixelHeight = Math.abs(bbox.max.y - pixelMinY);

    var xFactor = coordWidth / pixelWidth;
    var yFactor = coordHeight / pixelHeight;

    var linedata = _.map(lineGeom.coordinates, toUtm33);

    var points = _.map(linedata, function (coord) {
        var x = coord[0];
        var pixelX = pixelMinX + ((x - coordMinX) / xFactor);
        var y = coord[1];
        var pixelY = pixelMinY + ((y - coordMinY) / yFactor);
        return {x: pixelX, y: pixelY, z: 0};
    });

    if (this.geometry.loaded) {
        points = clampLineString(points, this.geometry);
    }
    var line = createLine(points);
    this.scene.add(line);

    if (!this.geometry.loaded) {
        if (!this.linesToClamp) {
            this.linesToClamp = [];
        }
        this.linesToClamp.push(line);
    }
};

ThreeDMapUntiled.prototype._clampLines = function () {
    if (!this.linesToClamp) {
        return;
    }
    _.each(this.linesToClamp, function (line) {
        var clamped = clampLineString(line.geometry.vertices, this.geometry);
        this.scene.remove(line);
        this.scene.add(createLine(clamped));
    }, this);
    this.linesToClamp = [];
};

export default ThreeDMapUntiled;
