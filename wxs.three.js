var wxs3 = wxs3 || {};

var camera, scene, renderer, geometry, material, controls, dem;

//check WebGL
(function () {
    if (!window.WebGLRenderingContext) {
        // the browser doesn't even know what WebGL is
        window.location = "ttp://get.webgl.org";
    }
    /*
     else {
     var canvas = document.getElementById("myCanvas");
     ^   var context = canvas.getContext("webgl");
     if (!context) {
     // browser supports WebGL but initialization failed.
     window.location = "http://get.webgl.org/troubleshooting";
     }
     }
     */

})();

// extraction for URL parameters
function getQueryVariable(variable) {
    var pair,
        i,
        vars,
        query;
    console.log("getQueryVariable :" + variable);

    query = window.location.search.substring(1);
    vars = query.split("&");
    for (i = 0; i < vars.length; i++) {
        pair = vars[i].split("=");
        if (pair[0].toUpperCase() == variable) {
            return pair[1];
        }
    }
    return(false);
}

var dim = {
    width: window.innerWidth,
    height: window.innerHeight,
    demWidth: getQueryVariable("WIDTH") || 200,
    demHeight: getQueryVariable("HEIGHT") || 200,
    bbox: getQueryVariable("BBOX") || '161244,6831251,171526,6837409',
    metersWidth: 0,
    metersHeight: 0,
    init: function () {
        this.metersWidth = this.bbox.split(',')[2] - this.bbox.split(',')[0];
        this.metersHeight = this.bbox.split(',')[3] - this.bbox.split(',')[1];
        return this;
    },
    crs: getQueryVariable("CRS") || getQueryVariable("SRS") || 'EPSG:32633',
    coverage: getQueryVariable("COVERAGE") || 'land_utm33_10m',
    wms: getQueryVariable("WMS") || 'http://openwms.statkart.no/skwms1/wms.topo2',
    wmsMult: getQueryVariable("WMSMULT") || 5,
    wmsFormat: getQueryVariable("WMSFORMAT") || "image/png",
    wmsFormatMode: "",
    zInv: getQueryVariable("ZINV") || false,
    zMult: getQueryVariable("ZMULT")
    //x: getQueryVariable("X") || -dim.demHeight / 2,
    //y: getQueryVariable("Y") || -dim.demWidth / 2
}.init();

wxs3.init = function () {
    var plane, cameraHeight, fov, proportionAverage, proportionHeight, proportionWidth;

    if (dim.metersWidth > dim.metersHeight) {
        dim.demWidth = parseInt((dim.metersWidth / dim.metersHeight) * dim.demWidth);
    } else if (dim.metersWidth < dim.metersHeight) {
        dim.demHeight = parseInt((dim.metersHeight / dim.metersWidth) * dim.demHeight);
    }

    proportionWidth = dim.metersWidth / dim.demWidth; // mapunits between vertexes in x-dimention
    proportionHeight = dim.metersHeight / dim.demHeight; // mapunits between vertexes in y-dimention
    proportionAverage = ((proportionWidth + proportionHeight) / 2); // average mapunits between vertexes

    if (dim.zInv) {
        proportionAverage *= -1;
    }
    if (dim.zMult) {
        dim.zMult = proportionAverage / dim.zMult;
    } else {
        dim.zMult = proportionAverage;
    }

    if (getQueryVariable("WMSFORMATMODE")) {
        dim.wmsFormatMode = '; mode=' + getQueryVariable("WMSFORMATMODE");
    }

    // We've defined some standardlayers for the default wms-service in topo2.layers.js. Overwrite them if defined in url.
    layers = getQueryVariable("LAYERS") || layers;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(dim.width, dim.height);

    scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xeeeeee));

    fov = 45;
    camera = new THREE.PerspectiveCamera(fov, dim.width / dim.height, 0.1, 1000);
    cameraHeight = getQueryVariable("Z") || (dim.demHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);

    //camera.position.set(dim.x, dim.y, cameraHeight);
    camera.position.set(0, 0, cameraHeight);
    camera.lookAt(0, 0, 0);
    //camera.up.set( 1, 1, 1 );
    //camera.up.set( 0, 0, 1 );

    controls = new THREE.TrackballControls(camera);
    geometry = new THREE.PlaneGeometry(dim.demWidth, dim.demHeight, dim.demWidth - 1, dim.demHeight - 1);

    dem = new XMLHttpRequest();
    dem.open('GET', 'http://openwms.statkart.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=XYZ&COVERAGE=' +
        dim.coverage + '&bbox=' + dim.bbox + '&CRS=' + dim.crs + '&RESPONSE_CRS=' + dim.crs + '&WIDTH=' + dim.demWidth + '&HEIGHT=' + dim.demHeight);
    dem.onreadystatechange = function () {
        var i, l,
            lines;
        if (dem.readyState == 4) {
            lines = dem.responseText.split("\n");
            for (i = 0, l = geometry.vertices.length; i < l; i++) {

                geometry.vertices[i].z = (lines[i].split(' ')[2] / dim.zMult);
            }
            window.render();
            //while (window.cameraHeight > 50){
            //  window.camera.position.set(0, 0, cameraHeight);
            //  setTimeout(function() { window.cameraHeigh=window.cameraHeigh-1;}, 5000);
            //}
        }
    };
    dem.send();

    material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture(dim.wms + '?service=wms&version=1.3.0&request=getmap&crs=' +
        dim.crs + '&srs=' + dim.crs + '&WIDTH=' + dim.demWidth * dim.wmsMult + '&HEIGHT=' + dim.demHeight * dim.wmsMult + '&bbox=' + dim.bbox +
        '&layers=' + layers + '&format=' + dim.wmsFormat + dim.wmsFormatMode)
    });
    plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    document.getElementById('webgl').appendChild(renderer.domElement);
}();

function render() {
    controls.update();
    requestAnimationFrame(render);
    renderer.render(scene, camera);
}


