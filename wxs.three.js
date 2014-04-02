var wxs3 = wxs3 || {};

var camera, scene, renderer,  controls,  geomGroup;

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
    demWidth: getQueryVariable("WIDTH") || 50,
    demHeight: getQueryVariable("HEIGHT") || 50,
    bbox: getQueryVariable("BBOX") || '161244,6831251,171526,6837409',
    metersWidth: 0,
    metersHeight: 0,
    minx: 0,
    maxx: 0,
    miny: 0,
    maxy: 0,
    tilesFinished: 0,
    tilesTotal: 4,
    init: function () {
        this.metersWidth = this.bbox.split(',')[2] - this.bbox.split(',')[0];
        this.metersHeight = this.bbox.split(',')[3] - this.bbox.split(',')[1];
        this.minx=parseInt(this.bbox.split(',')[0]);
        this.maxx=parseInt(this.bbox.split(',')[2]);
        this.miny=parseInt(this.bbox.split(',')[1]);
        this.maxy=parseInt(this.bbox.split(',')[3]);
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
    camera = new THREE.PerspectiveCamera(fov, dim.width / dim.height, 0.1, 20000);
    // Some trig to find height for camera
    cameraHeight = getQueryVariable("Z") || (dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
    // Place camera in middle of bbox
    camera.position.set((dim.minx+dim.maxx)/2, (dim.miny+dim.maxy)/2, cameraHeight);
    controls = new THREE.TrackballControls(camera);
    // Point camera directly down
    controls.target=new THREE.Vector3((dim.minx+dim.maxx)/2, (dim.miny+dim.maxy)/2,0);
    // For future reference
    /*
    materials=[];
    geometryMain = new THREE.PlaneGeometry(dim.maxx-dim.minx, dim.maxy-dim.miny, (dim.demWidth - 1) , (dim.demHeight - 1));
    planeMain=new THREE.Mesh(geometryMain,new THREE.MeshFaceMaterial(materials));
    planeMain.position.y=(dim.miny+dim.maxy)/2;
    planeMain.position.x=(dim.minx+dim.maxx)/2;
    */
    // Generate tiles and boundingboxes
    bbox2tiles(dim.minx,dim.miny,dim.maxx,dim.maxy);
    //scene.add(planeMain);
    
 document.getElementById('webgl').appendChild(renderer.domElement);
}();

function bbox2tiles(minx,miny,maxx,maxy){
    //TODO: generic tilematrix-parsing

    // Proof of concept with 2 subdivision in each dimention:
    //0,0
    addTile(1,minx,miny,(minx+maxx)/2,(miny+maxy)/2);
    //1,0
    addTile(2,(minx+maxx)/2,miny,maxx,(miny+maxy)/2);
    //0,1
    addTile(3,minx,(miny+maxy)/2,(minx+maxx)/2,maxy);
    //1,1
    addTile(4,(minx+maxx)/2,(miny+maxy)/2,maxx,maxy);
   
    //addTile(1,minx,miny,maxx,maxy);
    
    
}

function render() {
    controls.update();
    requestAnimationFrame(render);
    renderer.render(scene, camera);
}

function addTile(tileNr,minx,miny,maxx,maxy){
    /*
    geometry = new THREE.PlaneGeometry(maxx-minx+100, maxy-miny+100, (dim.demWidth - 1) + 100, (dim.demHeight - 1)+100);
    bbox=parseInt(minx+50)+','+parseInt(miny+50)+','+parseInt(maxx+50)+','+parseInt(maxy+50);
    */
   
    var bbox=parseInt(minx)+','+parseInt(miny)+','+parseInt(maxx)+','+parseInt(maxy);
    var dem = new XMLHttpRequest();
    dem.open('GET', 'http://openwms.statkart.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=XYZ&COVERAGE=' + dim.coverage + 
        '&bbox=' + bbox + 
        '&CRS=' + dim.crs + 
        '&RESPONSE_CRS=' + dim.crs + 
        /*
        '&WIDTH=' + parseInt(dim.demWidth +100)+ 
        '&HEIGHT=' + parseInt(dim.demHeight + 100),false);
        */
        '&WIDTH=' + parseInt(dim.demWidth)+ 
        '&HEIGHT=' + parseInt(dim.demHeight),true);
        
    dem.onreadystatechange = function () {
        var i, l, lines;
 var geometry;
        if (this.readyState == 4) {
             var geometry = new THREE.PlaneGeometry(maxx-minx, maxy-miny, (dim.demWidth - 1) , (dim.demHeight - 1));
            lines = this.responseText.split("\n");
            for (i = 0, l = geometry.vertices.length; i < l; i++) {
                //geometry.vertices[i].z = (lines[i].split(' ')[2] / dim.zMult);
                geometry.vertices[i].z = lines[i].split(' ')[2];
                //console.log(geometry.vertices[i].z)
            }
            /*material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture(dim.wms + '?service=wms&version=1.3.0&request=getmap&crs=' +
        dim.crs + '&srs=' + dim.crs + '&WIDTH=' + dim.demWidth * dim.wmsMult + '&HEIGHT=' + dim.demHeight * dim.wmsMult + '&bbox=' + bbox +
      '&layers=' + layers + '&format=' + dim.wmsFormat + dim.wmsFormatMode)});
            */
      material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture(dim.wms + '?service=wms&version=1.3.0&request=getmap&crs=' +
        dim.crs + '&srs=' + dim.crs + '&WIDTH=' + dim.demWidth * dim.wmsMult + '&HEIGHT=' + dim.demHeight * dim.wmsMult + '&bbox=' + bbox +
      '&layers=' + layers + '&format=' + dim.wmsFormat + dim.wmsFormatMode,
      new THREE.UVMapping()
      )});
      //materials.push(material);
       
    
    //material.needsUpdate=true;
    //material.map.needsUpdate=true;
    var plane = new THREE.Mesh(geometry, material);
    // Move plane to coordinates
    
    plane.position.y=(miny+maxy)/2;
    plane.position.x=(minx+maxx)/2;
    scene.add(plane);
    

    // For future reference
    /*
    planeMain.position.y=(miny+maxy)/2;
    planeMain.position.x=(minx+maxx)/2;
    */
    //THREE.GeometryUtils.merge(geometryMain,geometry);
    //planeMain.add(plane);
            dim.tilesFinished+=1;
            window.render();
            /*plane.scale.z=0;
            while (plane.scale.z<1){
                plane.scale.z+=0.001;
                window.render();
            }
            */
            /*
            if (dim.tilesFinished==dim.tilesTotal){
            //document.getElementById('webgl').children[tilenr].
                window.render();
            }
            */
        //}
        //geometry.needsUpdate=true;
            console.log('rendering bbox ' + bbox);
            console.log('nr of finished geom: ' + dim.tilesFinished);
    }};
    dem.send();

    //material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture('http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=topo2&STYLE=default&TILEMATRIXSET=EPSG%3A32633&TILEMATRIX=EPSG%3A32633%3A9&TILEROW=147&TILECOL=275&FORMAT=image%2Fpng')
      
    

    
//To here
}


