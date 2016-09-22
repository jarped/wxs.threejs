import {
    WebGLRenderer,
    Scene,
    AmbientLight,
    PerspectiveCamera,
    PlaneGeometry,
    MeshPhongMaterial,
    DoubleSide,
    Mesh
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
};

ThreeDMapUntiled.prototype.on = function (event, callback, context) {
    this.events.on(event, callback, context);
};

ThreeDMapUntiled.prototype.init = function () {
    this.reloadTimer = -1;
    this.height = [];
    this.midHeight = null;
    this.linesToClamp = [];

    this.renderer = this.createRenderer();
    this._camera = this.createCamera();
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
    //this.loadTerrain();
    this.terrain.loadTerrain(this.geometry.vertices.length, this.terrainLoaded.bind(this));
    this.events.fire('onTextureLoadStart');
    this.texture.loadTexture(this.textureLoaded.bind(this));

    //Adust canvas if container is resized
    window.addEventListener('resize', this.resizeMe.bind(this), false);
    this.on('onTerrainLoadEnd', this._clampLines, this);
};

ThreeDMapUntiled.prototype.terrainLoaded = function (data) {
    for (var i = 0, l = this.geometry.vertices.length; i < l; i++) {
        this.geometry.vertices[i].z = ((data.height[i] - data.midHeight) / this.dim.zMult);
    }
    this.geometry.loaded = true;
    this.geometry.verticesNeedUpdate = true;
    this.events.fire('onTerrainLoadEnd');
};

ThreeDMapUntiled.prototype.textureLoaded = function (texture) {
    this.material.map = texture;
    this.material.needsUpdate = true;
    this.events.fire('onTextureLoadEnd');
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

ThreeDMapUntiled.prototype.createGeometry = function () {
    return new PlaneGeometry(
        this.dim.demWidth,
        this.dim.demHeight,
        this.dim.demWidth - 1,
        this.dim.demHeight - 1
    );
};

ThreeDMapUntiled.prototype.createMaterial = function () {
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

ThreeDMapUntiled.prototype.resizeMe = function () {
    window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(this.reloadAll.bind(this), 1000);
    return;
};

ThreeDMapUntiled.prototype.reloadAll = function () {
    this.dim.width = this.dim.div.clientWidth;
    this.dim.height = this.dim.div.clientHeight;

    this._camera.aspect = this.dim.width / this.dim.height;
    this._camera.updateProjectionMatrix();

    delete(this.controls);
    this.controls = this.createControls();
    this.renderer.setSize(this.dim.width, this.dim.height);
};


ThreeDMapUntiled.prototype.addLine = function (lineGeom, lineStyle) {
    var line = Line(lineGeom, lineStyle, this.geometry, this.dim.envelope);
    var threeLine = line.getThreeLine();
    this.scene.add(threeLine);
    if (line.needsClamp()) {
        this.linesToClamp.push(line);
    }
};

ThreeDMapUntiled.prototype._clampLines = function () {
    _.each(this.linesToClamp, function (line) {
        var oldLine = line.getThreeLine();
        var clamped = line.clamp();
        this.scene.remove(oldLine);
        this.scene.add(clamped);
    }, this);
    this.linesToClamp = [];
};

export default ThreeDMapUntiled;
