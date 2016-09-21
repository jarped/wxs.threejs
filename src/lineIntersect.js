export default function lineIntersect(l1, l2) {
    var x1 = l1[0].x;
    var y1 = l1[0].y;

    var x2 = l1[1].x;
    var y2 = l1[1].y;

    var x3 = l2[0].x;
    var y3 = l2[0].y;

    var x4 = l2[1].x;
    var y4 = l2[1].y;
    var ua, ub, denom = (y4 - y3)*(x2 - x1) - (x4 - x3)*(y2 - y1);
    if (denom === 0) {
        return null;
    }
    ua = ((x4 - x3)*(y1 - y3) - (y4 - y3)*(x1 - x3))/denom;
    ub = ((x2 - x1)*(y1 - y3) - (y2 - y1)*(x1 - x3))/denom;
    return {
        x: x1 + ua*(x2 - x1),
        y: y1 + ua*(y2 - y1),
        z: 0
    };
}
