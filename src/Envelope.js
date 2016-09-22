import * as _ from 'underscore';

import toUtm33 from './util/toUtm33';

export default function Envelope(bbox) {

    var bbox = _.map(bbox.split(','), parseFloat);
    var ne = [bbox[0], bbox[1]];
    var sw = [bbox[2], bbox[3]];
    var ne33 = toUtm33(ne);
    var sw33 = toUtm33(sw);

    var envelope = ne33.concat(sw33);

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
        minY: minY
    };
}
