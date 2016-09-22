import {Vector3} from 'three';
import * as _ from 'underscore';

import checkIntersect from './checkIntersect';
import lineIntersect from './lineIntersect';

function calcZ(p1, p2, p3, x, y) {
    var det = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);
    var l1 = ((p2.y - p3.y) * (x - p3.x) + (p3.x - p2.x) * (y - p3.y)) / det;
    var l2 = ((p3.y - p1.y) * (x - p3.x) + (p1.x - p3.x) * (y - p3.y)) / det;
    var l3 = 1.0 - l1 - l2;
    return l1 * p1.z + l2 * p2.z + l3 * p3.z;
}

function getDistance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function clampLineSegment(l, geometry) {
    return _.chain(geometry.faces)
        .map(function (face) {
            var a = geometry.vertices[face.a];
            var b = geometry.vertices[face.b];
            var c = geometry.vertices[face.c];

            var line1 = [a, b];
            var line2 = [b, c];
            var line3 = [c, a];

            var ints = [];
            if (checkIntersect(l, line1) ) {
                ints.push(lineIntersect(line1, l));
            }
            if (checkIntersect(l, line2) ) {
                ints.push(lineIntersect(line2, l));
            }
            if (checkIntersect(l, line3) ) {
                ints.push(lineIntersect(line3, l));
            }
            return _.map(ints, function (intersect) {
                var z = calcZ(a, b, c, intersect.x, intersect.y);
                return {
                    x: intersect.x,
                    y: intersect.y,
                    z: z + 0.01,
                    dist: getDistance(l[0], intersect)
                };
            });
        }).
        flatten()
        .sortBy(function (p) {
            return Math.abs(p.dist);
        })
        .value();
}

function clampLineString(line, geometry) {
    var p = _.map(_.range(0, line.length - 1), function (i) {
        var a = line[i];
        var b = line[i + 1];
        return clampLineSegment([a, b], geometry);
    });
    return _.flatten(p);
}

export default clampLineString;