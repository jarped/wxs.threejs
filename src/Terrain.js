import {PlaneGeometry} from 'three';

import TIFFParser from './../tiff-js/tiff.js';

import createQueryString from './util/createQueryString';

var Terrain = function (terrainConfig, dim) {

    var isTiff = (terrainConfig.format === 'geotiff');
    var geometry;

    function _parseHeights(xhr) {
        var lines;
        var minHeight = 10000,
            maxHeight = -10000,
            numVertices = geometry.vertices.length;

        var tiffParser, tiffArray;
        if (isTiff) {
            tiffParser = new TIFFParser();
            tiffArray = tiffParser.parseTIFF(xhr.response);
            lines = tiffArray;
        } else { //assume ZYZ
            lines = xhr.responseText.split('\n');
        }

        var height = [];
        //loop trought heights and calculate midHeigth
        if (isTiff) { //geotiff
            var i = -1;
            for (var j = 0; j < lines.length; j++) {
                for (var k = 0; k < lines[j].length; k++) {
                    height[++i] = parseInt(lines[j][k][0], 10);
                    if (height[i] < minHeight) {
                        minHeight = height[i];
                    } else if (height[i] > maxHeight) {
                        maxHeight = height[i];
                    }
                }
            }
        } else {//XYZ
            for (var i = 0, l = numVertices; i < l; i++) {
                height[i] = parseInt(lines[i].split(' ')[2], 10);
                if (height[i] < minHeight) {
                    minHeight = height[i];
                } else if (height[i] > maxHeight) {
                    maxHeight = height[i];
                }
            }
        }

        //The Vertical center of the height model is adjusted to (min + max) / 2.
        //If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level,
        //a tipping of the model will cause the map to disappear over the screen top without this
        //adjustment.
        //On a computer you can move the model down width a right-click-drag,
        //but not on a mobile device.
        var midHeight = (maxHeight + minHeight) / 2;

        return {
            height: height,
            midHeight: midHeight
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
    }

    function loadTerrain(callback) {
        var demRequest = new XMLHttpRequest();

        var params = {
            SERVICE: 'WCS',
            VERSION: '1.0.0',
            REQUEST: 'GetCoverage',
            COVERAGE: terrainConfig.coverage,
            FORMAT: terrainConfig.format,
            bbox: dim.envelope.join(','),
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

    _createGeometry();

    return {
        loadTerrain: loadTerrain,
        getGeometry: function getGeometry() {
            return geometry;
        }
    };
};

export default Terrain;