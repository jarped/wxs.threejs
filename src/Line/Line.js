import * as _ from 'underscore';
import {
    Line,
    LineBasicMaterial,
    Geometry,
    Vector3
} from 'three';

import clampLineString from './clampLineString';
import toUtm33 from '../util/toUtm33';

function ALine(lineGeom, style, geometry, envelope) {

    var needsClamp = true;
    var line;

    function _createLine(points, color) {
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

    function getThreeLine() {

        if (line) {
            return line;
        }

        if (lineGeom.type !== 'LineString') {
            throw new Error('Expected GeoJSON LineString geometry');
        }

        //get envelope stuff
        var coordMinX = envelope.minX();
        var coordMinY = envelope.minY();

        //get the bbox of the geometry
        geometry.computeBoundingBox();
        var bbox = geometry.boundingBox;

        var pixelMinX = bbox.min.x;
        var pixelMinY = bbox.min.y;
        var pixelWidth = Math.abs(bbox.max.x - pixelMinX);
        var pixelHeight = Math.abs(bbox.max.y - pixelMinY);

        var xFactor = envelope.width() / pixelWidth;
        var yFactor = envelope.height() / pixelHeight;

        var linedata = _.map(lineGeom.coordinates, toUtm33);

        var points = _.map(linedata, function (coord) {
            var x = coord[0];
            var pixelX = pixelMinX + ((x - coordMinX) / xFactor);
            var y = coord[1];
            var pixelY = pixelMinY + ((y - coordMinY) / yFactor);
            return {x: pixelX, y: pixelY, z: 0};
        });

        if (geometry.loaded) {
            points = clampLineString(points, geometry);
        }
        line = _createLine(points);

        if (geometry.loaded) {
            needsClamp = false;
        }
        return line;
    };

    function clamp() {
        line = _createLine(clampLineString(line.geometry.vertices, geometry));
        return line;
    }

    return {
        getThreeLine: getThreeLine,
        clamp: clamp,
        needsClamp: function needsClamp() {
            return needsClamp;
        }
    };
}

export default ALine;