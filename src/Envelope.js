import * as _ from 'underscore';

import transform from './util/transform';

export default function Envelope(bbox, crs, bboxCrs) {
    var bbox = _.map(bbox.split(','), parseFloat);
    var ne = [bbox[0], bbox[1]];
    var sw = [bbox[2], bbox[3]];
    if (crs !== bboxCrs) {
        ne = transform(ne, bboxCrs, crs);
        sw = transform(sw, bboxCrs, crs);
    }

    var envelope = ne.concat(sw);

    function width() {
        return envelope[2] - envelope[0];
    }

    function height() {
        return envelope[3] - envelope[1];
    }

    function getBbox() {
        return envelope.join(',');
    }

    function minX() {
        return envelope[0];
    }

    function minY() {
        return envelope[1];
    }

    return {
        width: width,
        height: height,
        bbox: getBbox,
        minX: minX,
        minY: minY,
        mapCrs: crs
    };
}
