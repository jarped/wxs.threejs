import {
    WebGLRenderer,
    Scene,
    AmbientLight,
    PerspectiveCamera,
    PlaneGeometry,
    MeshPhongMaterial,
    Mesh,
    DoubleSide,
    FrontSide
} from 'three';
import TrackballControls from 'three.trackball';
import * as _ from 'underscore';

import TIFFParser from './../tiff-js/tiff.js';
import createQueryString from './util/createQueryString';
import events from './util/events';
import Line from './Line/Line';

var ThreeDMapUntiled = function (dim, terrain, texture) {
    this.dim = dim;
    this.terrain = terrain;
    this.texture = texture;
    this.events = events();

    this.reloadTimer = -1;

    this.linesToClamp = [];

    this._renderer = this._createRenderer();
    this._camera = this._createCamera();
    this._controls = this._createControls();
    this._material = this._createMaterial();

    //Create Mesh and Scene
    var mesh = this._createMesh();
    this._scene = this._createScene(mesh);

    //Add webgl canvas to div
    this.dim.div.appendChild(this._renderer.domElement);

    //Start renderer and listen to changes in geometry
    this._render();

    //Load height model and texture asynchronously
    this.events.fire('onTerrainLoadStart');
    this.terrain.loadTerrain(this._terrainLoaded.bind(this));

    this.events.fire('onTextureLoadStart');
    this.texture.loadTexture(this._textureLoaded.bind(this));

    //Adust canvas if container is resized
    window.addEventListener('resize', this._resizeMe.bind(this), false);
    this.on('onTerrainLoadEnd', this._clampLines, this);
};

ThreeDMapUntiled.prototype.on = function (event, callback, context) {
    this.events.on(event, callback, context);
};


ThreeDMapUntiled.prototype._terrainLoaded = function () {
    this.events.fire('onTerrainLoadEnd');
    this._scene.add(this.terrain.getSides());
};

ThreeDMapUntiled.prototype._textureLoaded = function (texture) {
    this._material.map = texture;
    console.log(this._material);
    this._material.needsUpdate = true;
    this.events.fire('onTextureLoadEnd');
};

ThreeDMapUntiled.prototype._createRenderer = function () {
    var renderer = new WebGLRenderer({
        alpha: true
    });
    renderer.setSize(this.dim.width, this.dim.height);
    return renderer;
};


ThreeDMapUntiled.prototype._createScene = function (mesh) {
    var scene = new Scene();
    //Ambient Light for MeshPhongMaterial

    scene.add(new AmbientLight(0xffffff));
    scene.add(mesh);

    return scene;
};

ThreeDMapUntiled.prototype._createCamera = function () {
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
        if (canvCoefficient < (this.dim.demWidth / this.dim.demHeight)) {
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

ThreeDMapUntiled.prototype._createMaterial = function () {
    var material = new MeshPhongMaterial({ //for shading and Ambient Light
        side: this.terrain.showBox ? FrontSide : DoubleSide
    });
    material.wireframe = this.dim.wireframe;
    return material;
};

ThreeDMapUntiled.prototype._createMesh = function () {
    return new Mesh(this.terrain.getGeometry(), this._material);
};

ThreeDMapUntiled.prototype._createControls = function () {
    return new TrackballControls(this._camera);
};

ThreeDMapUntiled.prototype._render = function () {
    this._controls.update();
    window.requestAnimationFrame(this._render.bind(this));
    this._renderer.render(this._scene, this._camera);
};

ThreeDMapUntiled.prototype._resizeMe = function () {
    window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(this._reloadAll.bind(this), 1000);
    return;
};

ThreeDMapUntiled.prototype._reloadAll = function () {
    this.dim.width = this.dim.div.clientWidth;
    this.dim.height = this.dim.div.clientHeight;

    this._camera.aspect = this.dim.width / this.dim.height;
    this._camera.updateProjectionMatrix();

    delete(this._controls);
    this._controls = this._createControls();
    this._renderer.setSize(this.dim.width, this.dim.height);
};

ThreeDMapUntiled.prototype.addLine = function (lineGeom, lineStyle) {
    var line = Line(lineGeom, lineStyle, this.terrain.getGeometry(), this.dim.envelope);
    var threeLine = line.getThreeLine();
    this._scene.add(threeLine);
    if (line.needsClamp()) {
        this.linesToClamp.push(line);
    }
};

ThreeDMapUntiled.prototype._clampLines = function () {
    _.each(this.linesToClamp, function (line) {
        var oldLine = line.getThreeLine();
        var clamped = line.clamp();
        this._scene.remove(oldLine);
        this._scene.add(clamped);
    }, this);
    this.linesToClamp = [];
};

export default ThreeDMapUntiled;
