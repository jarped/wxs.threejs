var wxs3 = wxs3 || {};

(function (ns) {
    'use strict';

    ns.WCS=function(tileSpanX,  tileSpanY, wcsWidth, wcsHeight){
        this.tileSpanX=tileSpanX;
        this.tileSpanY=tileSpanY;
        this.wcsWidth=wcsWidth;
        this.wcsHeight=wcsHeight;
        this.geometry=new THREE.PlaneGeometry( tileSpanX,  tileSpanY, wcsWidth , wcsHeight);
    };


      ns.WCS.prototype.wcsFetcher = function ( WMTSCall) {
        var demTileRequest = new XMLHttpRequest();
        demTileRequest.open('GET', WMTSCall.url.wcs, true);
        var that = this;
        demTileRequest.onreadystatechange = function () {
            if (this.readyState === 4) {
                that.updateGeometry(this.responseText.split("\n"), that.geometry);
            }
        };
        demTileRequest.send();
    }

    ns.WCS.prototype.updateGeometry = function (xyzlines, geometry) {
        var i, length = geometry.vertices.length;
        for (i = 0; i < length; i = i + 1) {
            var line = xyzlines[i].split(' ');
            // Back to just manipulating height for now.
            geometry.vertices[i].z = line[2] ;
        }
        // Mark geometry for update on next render.
        geometry.verticesNeedUpdate=true;
        // Don't know if this helps, better to err on safe side.
        this.WCS=null;
     }
}(wxs3));