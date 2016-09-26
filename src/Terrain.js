import {
    PlaneGeometry,
    MeshBasicMaterial,
    DoubleSide,
    BackSide,
    Geometry,
    Vector3,
    Face3,
    Group,  
    Mesh
} from 'three';
import * as _ from 'underscore';

import TIFFParser from './../tiff-js/tiff.js';

import createQueryString from './util/createQueryString';


var Terrain = function (terrainConfig, dim) {

    var isTiff = (terrainConfig.format === 'geotiff');
    var geometry;
    var minHeight;

    function _parseHeights(xhr) {
        var lines,
            numVertices = geometry.vertices.length;

        var tiffParser, tiffArray;
        if (isTiff) {
            tiffParser = new TIFFParser();
            tiffArray = tiffParser.parseTIFF(xhr.response);
            lines = tiffArray;
        } else { //assume ZYZ
            lines = xhr.responseText.split('\n');
        }

        var heights = [];
        //loop trought heights and calculate midHeigth
        if (isTiff) { //geotiff
            var i = -1;
            for (var j = 0; j < lines.length; j++) {
                for (var k = 0; k < lines[j].length; k++) {
                    heights[++i] = parseInt(lines[j][k][0], 10);
                }
            }
        } else {//XYZ
            for (var i = 0, l = numVertices; i < l; i++) {
                heights[i] = parseInt(lines[i].split(' ')[2], 10);
            }
        }

        var minHeight = _.min(heights);
        var maxHeight = _.max(heights);

        //The Vertical center of the height model is adjusted to (min + max) / 2.
        //If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level,
        //a tipping of the model will cause the map to disappear over the screen top without this
        //adjustment.
        //On a computer you can move the model down width a right-click-drag,
        //but not on a mobile device.
        var midHeight = (maxHeight + minHeight) / 2;

        return {
            height: heights,
            midHeight: midHeight,
            minHeight: ((minHeight - midHeight) / dim.zMult)
        };
    };

    function _createGeometry() {
        geometry = new PlaneGeometry(
            dim.demWidth,
            dim.demHeight,
            dim.demWidth - 1,
            dim.demHeight - 1
        );
    };

    function _terrainLoaded(data) {
        for (var i = 0, l = geometry.vertices.length; i < l; i++) {
            geometry.vertices[i].z = ((data.height[i] - data.midHeight) / dim.zMult);
        }
        geometry.loaded = true;
        geometry.verticesNeedUpdate = true;
        minHeight = data.minHeight;
    }

    function loadTerrain(callback) {
        var demRequest = new XMLHttpRequest();

        var params = {
            SERVICE: 'WCS',
            VERSION: '1.0.0',
            REQUEST: 'GetCoverage',
            COVERAGE: terrainConfig.coverage,
            FORMAT: terrainConfig.format,
            bbox: dim.envelope.bbox(),
            CRS: dim.crs,
            RESPONSE_CRS: dim.crs,
            WIDTH: dim.demWidth,
            HEIGHT: dim.demHeight
        };

        var wcsCall = terrainConfig.wcsUrl + '?' + createQueryString(params);
        if (isTiff) {
            demRequest.responseType = 'arraybuffer';
        }
        demRequest.open('GET', wcsCall, true);
        demRequest.onreadystatechange = function () {
            if (this.readyState === 4) {
                _terrainLoaded(_parseHeights(this));
                callback();
            }
        };
        demRequest.send();
    };

    function _createSideMesh(filter) {
        var points = _.chain(geometry.vertices)
            .filter(filter)
            .map(function (vertex) {
                return [
                    new Vector3(vertex.x, vertex.y, vertex.z),
                    new Vector3(vertex.x, vertex.y, minHeight)
                ];
            })
            .flatten()
            .value();
        var first = _.first(points).clone();
        var last = _.last(points).clone();
        first.z = minHeight;
        last.z = minHeight;

        var sideGeometry = new Geometry();
        points.unshift(first);
        points.push(last);

        var faces = _.map(_.range(1, points.length - 1), function (i) {
            return new Face3(i - 1, i, i + 1);
        });

        sideGeometry.vertices = points;
        sideGeometry.faces = faces;
        return new Mesh(sideGeometry, new MeshBasicMaterial({
            side: DoubleSide,
            color: 0xdddddd,
            wireframe: false
        }));
    }

    function getSides() {
        var material = new MeshBasicMaterial({
            wireframe: false,
            color: 0xdddddd,
            side: BackSide
        });

        var backGeom = new PlaneGeometry(
            dim.demWidth,
            dim.demHeight,
            dim.demWidth - 1,
            dim.demHeight - 1
        );

        for (var i = 0, l = backGeom.vertices.length; i < l; i++) {
            backGeom.vertices[i].z = minHeight;
        }

        var group = new Group();
        group.add(new Mesh(backGeom, material));

        geometry.computeBoundingBox();
        var bbox = geometry.boundingBox;

        var filterLeft = function (vertex) {
            return vertex.x === bbox.min.x;
        };

        var filterBottom = function (vertex) {
            return vertex.y === bbox.min.y;
        };

        var filterRight = function (vertex) {
            return vertex.x === bbox.max.x;
        };

        var filterTop = function (vertex) {
            return vertex.y === bbox.max.y;
        };

        group.add(_createSideMesh(filterBottom));
        group.add(_createSideMesh(filterRight));
        group.add(_createSideMesh(filterLeft));
        group.add(_createSideMesh(filterTop));
        return group;
    }

    _createGeometry();

    return {
        loadTerrain: loadTerrain,
        getGeometry: function getGeometry() {
            return geometry;
        },
        minHeight: function () {
            return minHeight;
        },
        getSides: getSides
    };
};

export default Terrain;