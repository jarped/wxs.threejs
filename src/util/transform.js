import proj4 from 'proj4/lib/index';
proj4.defs('EPSG:32632', '+title=EPSG Projection 32632 - WGS 84 / UTM zone 32N +proj=utm +zone=32 +ellps=WGS84 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32633', '+title=EPSG Projection 32633 - WGS 84 / UTM zone 33N +proj=utm +zone=33 +ellps=WGS84 +datum=WGS84 +units=m +no_defs');

export default function transform(coord, from, to) {
    return proj4(from, to, coord);
}