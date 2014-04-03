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
    demWidth: getQueryVariable("WIDTH") || 100,
    demHeight: getQueryVariable("HEIGHT") || 100,
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
    zMult: getQueryVariable("ZMULT"),
    proportionWidth: 0,
    proportionHeight: 0
    //x: getQueryVariable("X") || -dim.demHeight / 2,
    //y: getQueryVariable("Y") || -dim.demWidth / 2
}.init();

wxs3.init = function () {
    var cameraHeight, fov, proportionAverage, proportionHeight, proportionWidth;

    if (dim.metersWidth > dim.metersHeight) {
        dim.demWidth = parseInt((dim.metersWidth / dim.metersHeight) * dim.demWidth);
    } else if (dim.metersWidth < dim.metersHeight) {
        dim.demHeight = parseInt((dim.metersHeight / dim.metersWidth) * dim.demHeight);
    }

    dim.proportionWidth = dim.metersWidth / dim.demWidth; // mapunits between vertexes in x-dimention
    dim.proportionHeight = dim.metersHeight / dim.demHeight; // mapunits between vertexes in y-dimention
    proportionAverage = ((dim.proportionWidth + dim.proportionHeight) / 2); // average mapunits between vertexes

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
    //geometryMain = new THREE.PlaneGeometry(dim.maxx-dim.minx, dim.maxy-dim.miny, (dim.demWidth - 1) , (dim.demHeight - 1));
    geometryMain = new THREE.Geometry();
    //planeMain=new THREE.Mesh(geometryMain,new THREE.MeshFaceMaterial(materials));
    dummy=new THREE.Mesh();
    //planeMain.position.y=(dim.miny+dim.maxy)/2;
    //planeMain.position.x=(dim.minx+dim.maxx)/2;
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
    addTile('x0_y0',minx,miny,(minx+maxx)/2,(miny+maxy)/2);
    //1,0
    addTile('x1_y0',(minx+maxx)/2,miny,maxx,(miny+maxy)/2);
    //0,1
    addTile('x0_y1',minx,(miny+maxy)/2,(minx+maxx)/2,maxy);
    //1,1
    addTile('x1_y1',(minx+maxx)/2,(miny+maxy)/2,maxx,maxy);
   
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
   
    var bboxWCS=parseInt(minx)+','+parseInt(miny-dim.proportionHeight)+','+parseInt(maxx+dim.proportionWidth)+','+parseInt(maxy);
    //var bboxWCS=parseInt(minx)+','+parseInt(miny)+','+parseInt(maxx)+','+parseInt(maxy);
    
    var dem = new XMLHttpRequest();
    dem.open('GET', 'http://openwms.statkart.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=XYZ'+
        '&COVERAGE=' + dim.coverage + 
        '&bbox=' + bboxWCS + 
        '&CRS=' + dim.crs + 
        '&RESPONSE_CRS=' + dim.crs + 
        /*
        '&WIDTH=' + parseInt(dim.demWidth +2)+ 
        '&HEIGHT=' + parseInt(dim.demHeight + 2),
        */
        '&WIDTH=' + parseInt(dim.demWidth)+ 
        '&HEIGHT=' + parseInt(dim.demHeight), // +
        //'&INTERPOLATION=bilinear',
        true
        );
        
    dem.onreadystatechange = function () {
        var i, l, lines;
 var geometry, bboxWMS, minxWMS, minyWMS,maxxWMS,maxyWMS;
 
        if (this.readyState == 4) {

       var geometry = new THREE.PlaneGeometry(maxx-minx, maxy-miny, (dim.demWidth - 1) , (dim.demHeight - 1));
       //var geometry = new THREE.PlaneGeometry(maxx-minx, maxy-miny, (dim.demWidth ) , (dim.demHeight ));
            lines = this.responseText.split("\n");
            for (i = 0, l = geometry.vertices.length; i < l; i++) {
                //geometry.vertices[i].z = (lines[i].split(' ')[2] / dim.zMult);
                /*
                if( i<dim.demWidth){
                    continue;
                }
                */
                geometry.vertices[i].x = lines[i].split(' ')[0];
                geometry.vertices[i].y = lines[i].split(' ')[1];
                geometry.vertices[i].z = lines[i].split(' ')[2];
                if (i==0){
                    minxWMS=geometry.vertices[i].x;
                    maxyWMS=geometry.vertices[i].y;
                }
                if (i==l-1){
                    maxxWMS=geometry.vertices[i].x;
                    minyWMS=geometry.vertices[i].y;
                }
                //console.log(geometry.vertices[i].z)
            }
            bboxWMS=minxWMS+','+minyWMS+','+maxxWMS+','+maxyWMS;
            /*material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture(dim.wms + '?service=wms&version=1.3.0&request=getmap&crs=' +
        dim.crs + '&srs=' + dim.crs + '&WIDTH=' + dim.demWidth * dim.wmsMult + '&HEIGHT=' + dim.demHeight * dim.wmsMult + '&bbox=' + bbox +
      '&layers=' + layers + '&format=' + dim.wmsFormat + dim.wmsFormatMode)});
            */
            
      material = new THREE.MeshPhongMaterial(
          { 
          map: THREE.ImageUtils.loadTexture(
            dim.wms + '?service=wms&version=1.3.0&request=getmap'+
            '&crs=' + dim.crs + 
            '&srs=' + dim.crs + 
            '&WIDTH=' + dim.demWidth * dim.wmsMult + 
            '&HEIGHT=' + dim.demHeight * dim.wmsMult + 
            '&bbox=' + bboxWMS +
            '&layers=' + layers + 
            '&format=' + dim.wmsFormat + dim.wmsFormatMode,
            new THREE.UVMapping())
        }
      );
      material.name='material_'+tileNr;
      //materials.push(material);
       
    
    //material.needsUpdate=true;
    //material.map.needsUpdate=true;
    var plane = new THREE.Mesh(geometry, material);
    plane.name='tile_'+tileNr;
    // Move plane to coordinates
    
    //plane.position.y=(miny+maxy)/2;
    //plane.position.x=(minx+maxx)/2;
    scene.add(plane);
        // For future reference
    /*
    //dummy.position.y=(miny+maxy)/2;
    //dummy.position.x=(minx+maxx)/2;
    dummy.geometry=geometry;
    //dummy.map=material;
    THREE.GeometryUtils.merge(geometryMain,dummy);
    */
    // For future reference
    /*
    planeMain.position.y=(miny+maxy)/2;
    planeMain.position.x=(minx+maxx)/2;
    */
    //THREE.GeometryUtils.merge(geometryMain,plane);
    
    //planeMain.add(plane);
            dim.tilesFinished+=1;
            window.render();
            /*plane.scale.z=0;
            while (plane.scale.z<1){
                plane.scale.z+=0.001;
                window.render();
            }
            */
          
          // When all tiles are loaded, generate single mesh containing all
          //
          /*
            if (dim.tilesFinished==dim.tilesTotal){
            //document.getElementById('webgl').children[tilenr].
            
            geometryMain.computeFaceNormals();
            geometryMain.computeVertexNormals();
            geometryMain.elementsNeedUpdate=true;
            geometryMain.mergeVertices();
            THREE.GeometryUtils.triangulateQuads( geometryMain );
            
             geometryMain.mergeVertices();
            
             geometryFinal=new THREE.PlaneGeometry(dim.maxx-dim.minx, dim.maxy-dim.miny, ((dim.demWidth *(dim.tilesTotal/2)) - 1) , ((dim.demHeight * (dim.tilesTotal/2))- 1));
             var i2, l2;
             for (i2 = 0, l2 = geometryMain.vertices.length; i2 < l2; i2++) {
                //geometry.vertices[i].z = (lines[i].split(' ')[2] / dim.zMult);

                geometryFinal.vertices[i2].x = geometryMain.vertices[i2].x;
                geometryFinal.vertices[i2].y = geometryMain.vertices[i2].y;
                geometryFinal.vertices[i2].z = geometryMain.vertices[i2].z;
             }
            
                var mesh = new THREE.Mesh( geometryMain,new THREE.MeshBasicMaterial( { color: 0x000000, depthTest: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, wireframe: true } ));
                //var mesh = new THREE.Mesh( geometryMain, THREE.MeshFaceMaterial(materials) );
                //mesh.position.y=(dim.miny+dim.maxy)/2;
                //mesh.position.x=(dim.minx+dim.maxx)/2;
                
				scene.add( mesh );
                window.render();
            }
          */
        //}
        //geometry.needsUpdate=true;
            console.log('rendering bbox ' + bboxWMS);
            console.log('nr of finished geom: ' + dim.tilesFinished);
    }};
    dem.send();

    //material = new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture('http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=topo2&STYLE=default&TILEMATRIXSET=EPSG%3A32633&TILEMATRIX=EPSG%3A32633%3A9&TILEROW=147&TILECOL=275&FORMAT=image%2Fpng')
      
    

    
//To here
}


