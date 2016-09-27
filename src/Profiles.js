import * as _ from 'underscore';
import {
    PlaneGeometry,
    MeshPhongMaterial,
    Mesh,
    DoubleSide
} from 'three';

import Texture from './Texture';
import transform from './util/transform';

function Profiles(profiles, terrain, dim) {

    function _transformPoint(sSource, sDest, x, y) {
        if (typeof x === 'string') {
            x = 1.0 * x;
            y = 1.0 * y;
        }
        return transform([x, y], sSource, sDest);
    };

    function _createProfile(profile, config) {
            var verticalGeometry = new PlaneGeometry(1, 1);
            var verticalMaterial = new MeshPhongMaterial({
                side: DoubleSide,
                transparent: true
            });
            var crsSource = profile.CRS;

            //Check and transform to another map projection

            if (crsSource !== config.crsDestination) {
                var pointStart = _transformPoint(crsSource, config.crsDestination, profile.xyStart.x, profile.xyStart.y),
                    pointEnd = _transformPoint(crsSource, config.crsDestination, profile.xyEnd.x, profile.xyEnd.y);
                    profile.xyStart.x = pointStart[0];
                    profile.xyStart.y = pointStart[1];
                    profile.xyEnd.x = pointEnd[0];
                    profile.xyEnd.y = pointEnd[1];
            }

            //Local transformation
            var newStartX = config.kX * profile.xyStart.x - config.kX * dim.envelope.minX() - (dim.demWidth / 2),
                newStartY = config.kY * profile.xyStart.y - config.kY * dim.envelope.minY() - (dim.demHeight / 2),
                newEndX = config.kX * profile.xyEnd.x - config.kX * dim.envelope.minX() - (dim.demWidth / 2),
                newEndY = config.kY * profile.xyEnd.y - config.kY * dim.envelope.minY() - (dim.demHeight / 2),
                newStartZ = profile.zStart - terrain.midHeight(),
                newEndZ = profile.zEnd - terrain.midHeight(),
                verticalMesh = new Mesh(verticalGeometry, verticalMaterial);

            //XY
            verticalMesh.geometry.vertices[0].x = newStartX;
            verticalMesh.geometry.vertices[0].y = newStartY;
            verticalMesh.geometry.vertices[1].x = newEndX;
            verticalMesh.geometry.vertices[1].y = newEndY;
            verticalMesh.geometry.vertices[2].x = newStartX;
            verticalMesh.geometry.vertices[2].y = newStartY;
            verticalMesh.geometry.vertices[3].x = newEndX;
            verticalMesh.geometry.vertices[3].y = newEndY;

            //Z
            profile.zStart - terrain.midHeight();
            verticalMesh.geometry.vertices[0].z = newStartZ / dim.zMult; //900/zMult;
            verticalMesh.geometry.vertices[1].z = newStartZ / dim.zMult; //900/zMult;//
            verticalMesh.geometry.vertices[2].z = newEndZ / dim.zMult; //-1406/zMult;
            verticalMesh.geometry.vertices[3].z = newEndZ / dim.zMult; //-1406/zMult;


            var texture = Texture({
                type: 'image',
                imgUrl: profile.imgUrl
            }, null);
            texture.loadTexture(verticalMaterial);

            return verticalMesh;
    }

    function load(callback) {
        //json response for profile metadata db query
        var geometry = terrain.getGeometry();
        var modelLL = geometry.vertices[geometry.vertices.length - dim.demWidth];
        var modelUR = geometry.vertices[dim.demWidth - 1];
        var data = {
            crsDestination: dim.crs,
            kX: ((modelUR.x - modelLL.x) / dim.envelope.width()),
            kY: ((modelUR.y - modelLL.y) / dim.envelope.height())
        };

        var meshes = _.map(profiles, function (profile) {
            return _createProfile(profile, data);
        });

        callback(meshes);
    }

    return {
        load: load
    };
}

export default Profiles;