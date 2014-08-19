var wxs3 = wxs3 || {};

(function (ns) {
    'use strict';

    ns.ThreeDMap = function (layers, dim) {
        this.dim = dim;
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.controls = null;
        this.foregroundMatrix=null;
        this.backgroundMatrix=null;
        this.backgroundTiles=[];
        this.foregroundTiles=[];
        this.foregroundTilesIndex=[];

        // Setting demWidth and demHeight to some fraction of 256
        dim.demWidth=32;
        dim.demHeight=dim.demWidth;
        
        // Lets make some indexes with vertice-positions corresponding to edges.
        // TODO: make corner-indexes
        this.edges={
            top: [],
            left: [],
            right: [],
            bottom: []
        };
        var length=dim.demWidth*dim.demHeight;
        for (var i=0; i<length; i++) {
          if (i < this.dim.demWidth) {
            this.edges.top.push(i);
            if (i == 0) {
              this.edges.left.push(i);
            }
            else if (i == this.dim.demWidth - 1) {
              this.edges.right.push(i);
            }
          }
          else if (i >= length - this.dim.demWidth) {
            this.edges.bottom.push(i);
            if (i == length - this.dim.demWidth) {
              this.edges.left.push(i);
            }
            else if (i == length - 1) {
              this.edges.right.push(i);
            }
          }
          else if (i % this.dim.demWidth == 0) this.edges.left.push(i);
          else if ((i + 1) % this.dim.demWidth == 0) this.edges.right.push(i);
        }
        this.dim.wmsLayers = layers;
        this.createRenderer();
        this.createScene();
        this.createCamera();
        this.createControls();
        this.foregroundGroup = new THREE.Object3D();
        this.backgroundGroup = new THREE.Object3D();
        this.foregroundGroup.scale.z=dim.zMult;
        this.scene.add(this.foregroundGroup);
        this.scene.add(this.backgroundGroup);

        // Generate tiles and boundingboxes
        this.generateTiles();
        document.getElementById('webgl').appendChild(this.renderer.domElement);
        this.render();
    };

    ns.ThreeDMap.prototype.createRenderer = function () {
        this.renderer = new THREE.WebGLRenderer();      
        this.renderer.setSize(this.dim.width, this.dim.height);
    };

    ns.ThreeDMap.prototype.createScene = function () {
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xeeeeee));
    };

    ns.ThreeDMap.prototype.createCamera = function () {
        var fov = 45;
        this.camera = new THREE.PerspectiveCamera(
            fov,
            this.dim.width / this.dim.height,
            0.1,
            5000000
        );
        // Some trig to find height for camera
        var cameraHeight;
        if (this.dim.Z) {
            cameraHeight = this.dim.Z;
        } else {
            cameraHeight = (this.dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
        }
        // Place camera in middle of bbox
        var centerX = (this.dim.minx + this.dim.maxx) / 2;
        var centerY = (this.dim.miny + this.dim.maxy) / 2;
        this.camera.position.set(centerX, centerY, cameraHeight);
        
        this.raycaster = new THREE.Raycaster(this.camera.position, this.vector);
    };

    ns.ThreeDMap.prototype.createControls = function () {
        this.controls = new THREE.TrackballControls(this.camera);
        // Point camera directly down
        var centerX = (this.dim.minx + this.dim.maxx) / 2;
        var centerY = (this.dim.miny + this.dim.maxy) / 2;
        this.controls.target = new THREE.Vector3(centerX, centerY, 0);
    };

    ns.ThreeDMap.prototype.render = function () {
        
        for (var i =0; i< this.foregroundGroup.children.length; i++)
            if (this.foregroundGroup.children[i].scale.z<1 && this.foregroundGroup.children[i].geometry.loaded==true){
                this.foregroundGroup.children[i].scale.z+=0.02;
            }
            else if (this.foregroundGroup.children[i].scale.z>=1){
                if (this.foregroundGroup.children[i].geometry.processed['all']==false){
                    this.neighbourTest(this.foregroundGroup.children[i].WMTSCall);
                }
            }
        
        this.controls.update();
        window.requestAnimationFrame(this.render.bind(this));
        this.renderer.render(this.scene, this.camera);
        this.caster();
    };
    
    ns.ThreeDMap.prototype.generateTiles = function () {
        var capabilitiesURL='http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?Version=1.0.0&service=WMTS&request=getcapabilities';
        var WMTSCapabilities=new ns.WMTS(capabilitiesURL,32633);
        var that=this;
        WMTSCapabilities.fetchCapabilities(function(tileMatrixSet) {
                    that.bbox2tiles(tileMatrixSet);
        })
    }

    ns.ThreeDMap.prototype.bbox2tiles = function (tileMatrixSet) {
        var bounds=this.dim.getBounds();
        var WMTSCalls=[];
        var querySpanX=bounds.maxx-bounds.minx;
        var querySpanY=bounds.maxy-bounds.miny;
        var querySpanMin;
        var querySpanMax;
        var querySpanMinDim;
        var querySpanMaxDim;
    
        if (querySpanX>querySpanY){
            querySpanMin=querySpanY;
            querySpanMax=querySpanX;
            querySpanMinDim='y';
            querySpanMaxDim='x';
        }
        else{
            querySpanMin=querySpanX;
            querySpanMax=querySpanY;
            querySpanMinDim='x';
            querySpanMaxDim='y';
        }
        var tileMatrixCount=tileMatrixSet.length;

        // Here we find the first matrix that has a tilespan smaller than that of the smallest dimension of the input bbox.
        // We can control the resolution of the images by altering how large a difference there must be (half, quarter etc.)
        var spanDivisor=1;
        for (var tileMatrix=0; tileMatrix < tileMatrixCount; tileMatrix++){
            if(querySpanMinDim=='x'){
                if (tileMatrixSet[tileMatrix].TileSpanX<querySpanMin/spanDivisor){
                    this.foregroundMatrix=tileMatrixSet[tileMatrix];
                    this.backgroundMatrix=tileMatrixSet[tileMatrix-1];
                    break;
                }
            }
            else
                if (tileMatrixSet[tileMatrix].TileSpanY<querySpanMin/spanDivisor){
                    this.foregroundMatrix=tileMatrixSet[tileMatrix];
                    this.backgroundMatrix=tileMatrixSet[tileMatrix-1];
                    break;
                }
        }
        var tmpBounds=new THREE.Vector2((bounds.maxx+bounds.minx)/2, (bounds.maxy+bounds.miny)/2);
        WMTSCalls=this.centralTileFetcher(tmpBounds, this.backgroundMatrix);
        this.tileLoader(WMTSCalls, false);
        for (var i=0;i< WMTSCalls.length;i++){
            this.mainTileLoader({zoom: WMTSCalls[i].zoom,tileRow: WMTSCalls[i].tileRow, tileCol: WMTSCalls[i].tileCol});

        }

    };
    
    ns.ThreeDMap.prototype.centralTileFetcher = function (bounds, activeMatrix){
        var WMTSCalls=[];
        var name=null;
        var tileCol=Math.floor((bounds.x-activeMatrix.TopLeftCorner.minx)/activeMatrix.TileSpanX);
        var tileRow=Math.floor((activeMatrix.TopLeftCorner.maxy-bounds.y)/activeMatrix.TileSpanY);
        var tileColMin=tileCol-1;
        var tileRowMin=tileRow-1;
        var tileColMax=tileCol+1;
        var tileRowMax=tileRow+1;
        // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
        for (var tc=tileColMin;tc<=tileColMax;tc++)
            for (var tr=tileRowMin;tr<=tileRowMax;tr++){
                name=activeMatrix.Zoom+'_'+tr+'_'+tc;
                if (this.backgroundTiles.indexOf(name) == -1) {
                    this.backgroundTiles.push(name);
                    WMTSCalls.push(this.singleTileFetcher(tc, tr,activeMatrix));
                }
            }
        return WMTSCalls;
    };
    
    ns.ThreeDMap.prototype.singleTileFetcher = function (tileCol, tileRow, activeMatrix){
        var WMTSCall=null;
        var wmsBounds= [
            activeMatrix.TopLeftCorner.minx+(tileCol*activeMatrix.TileSpanX),
            activeMatrix.TopLeftCorner.maxy-((tileRow+1)*activeMatrix.TileSpanY),
            activeMatrix.TopLeftCorner.minx+((tileCol+1)*activeMatrix.TileSpanX),
            activeMatrix.TopLeftCorner.maxy-((tileRow)*activeMatrix.TileSpanY)
        ];
        var TileSpanY=activeMatrix.TileSpanY;
        var TileSpanX=activeMatrix.TileSpanX;
        var wcsDivisor=2;
        var grid2rasterUnitsX=((TileSpanX/(this.dim.demHeight-1)));
        var grid2rasterUnitsY=((TileSpanY/(this.dim.demWidth-1)));
        var wcsBounds = [
        // Add some to the extents as we need to put values from a raster onto a grid. Bazingah!
            (wmsBounds[0] - (grid2rasterUnitsX/wcsDivisor)), //minx
            (wmsBounds[1] - (grid2rasterUnitsY/wcsDivisor)), //miny
            (wmsBounds[2] + (grid2rasterUnitsX/wcsDivisor)), //maxx
            (wmsBounds[3] +  (grid2rasterUnitsY/wcsDivisor)) //maxy
        ];
        WMTSCall={
            tileSpanX: TileSpanX,
            tileSpanY: TileSpanY,
            tileRow: tileRow,
            tileCol: tileCol,
            zoom: activeMatrix.Zoom,
            // Setting these for easy debugging
            // TODO: define parameters here for reuse later on
            url: {
                cache_WMTS: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&Layer=topo2&Style=default&Format=image/png&TileMatrixSet=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&TileMatrix='+activeMatrix.Identifier+'&TileRow='+tileRow+'&TileCol='+tileCol,
                cache_wms: 'http://opencache.statkart.no/gatekeeper/gk/gk.open_wms?REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&Layer=topo2&Style=default&Format=image/png&width=256&height=256&crs=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+wmsBounds.join(',') ,
                wms: 'http://openwms.statkart.no/skwms1/wms.topo2?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&Layers=topo2_wms&Style=default&Format=image/png&WIDTH=256&HEIGHT=256&SRS=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+wmsBounds.join(',') ,
                //wcs 1.1.0 NOT WORKING with XYZ - needs to drop xml-part to use tiff-js?
                //wcs: 'http://wcs.geonorge.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.1.0&REQUEST=GetCoverage&FORMAT=geotiff&IDENTIFIER=all_50m&BOUNDINGBOX='+ wcsBounds.join(',')  +',urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridBaseCRS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridCS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridType=urn:ogc:def:method:WCS:1.1:2dGridIn2dCrs&GridOrigin=' +wmsBounds[0] +',' +wmsBounds[1] +'&GridOffsets='+grid2rasterUnitsX +',' +grid2rasterUnitsY + '&RangeSubset=50m:average' //[bands[1]]'
                wcs: 'http://wcs.geonorge.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=geotiff&WIDTH='+parseInt(dim.demWidth)+'&HEIGHT='+parseInt(dim.demWidth)+ '&COVERAGE=all_50m&crs=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+ wcsBounds.join(',') // + '&INTERPOLATION=BILINEAR' //+'&RESPONSE_CRS=EPSG:'+activeMatrix.Identifier.split(':')[1] //+ '&RangeSubset=50m:average[bands[1]]' +'&RESX='+grid2rasterUnitsX+'&RESY='+grid2rasterUnitsY
            },
            bounds: {
                minx: wmsBounds[0],
                miny: wmsBounds[1],
                maxx: wmsBounds[2],
                maxy: wmsBounds[3] 
            }
        };
    return WMTSCall;
    };

    ns.ThreeDMap.prototype.caster=function(){
        var name=null;
        this.vector = new THREE.Vector3( 0, 0, -1 );
        this.vector.applyQuaternion( this.camera.quaternion );
        this.raycaster = new THREE.Raycaster(this.camera.position, this.vector);
        this.intersects = this.raycaster.intersectObjects(this.backgroundGroup.children);        
        if (this.intersects.length > 0) {
            name=this.intersects[0].object.tileName;
            this.mainTileLoader(name);
            
        }
    };
    ns.ThreeDMap.prototype.mainTileLoader=function(name){
        var neighbourCalls=this.backGroundTileNeighbours(name);
        // add foreground
        var children=this.tileChildren(name);
        this.tileLoader(children, true);
        // add backgound
        for (var neighbourCall =0; neighbourCall< neighbourCalls.length; neighbourCall ++){
            this.tileLoader([ neighbourCalls[neighbourCall] ], false) ;
        }
        // remove processed background
        this.backgroundGroup.remove(this.backgroundGroup.getObjectByName(name.zoom+'_'+name.tileRow+'_'+name.tileCol));
    };

    ns.ThreeDMap.prototype.tileChildren=function(name){
        var WMTSCalls=[];
        var tileCol=name.tileCol*2;
        var tileRow=name.tileRow*2;
        var tileColMin=tileCol;
        var tileRowMin=tileRow;
        var tileColMax=tileCol+1;
        var tileRowMax=tileRow+1;
        // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
        for (var tc=tileColMin;tc<=tileColMax;tc++)
            for (var tr=tileRowMin;tr<=tileRowMax;tr++)
                //if (this.foregroundTiles.indexOf(name.zoom+'_'+tr+'_'+tc) ==-1) {
                if (this.foregroundGroup.getObjectByName(name.zoom+'_'+tr+'_'+tc) == undefined) {
                    // Add tile to index over loaded tiles
                    this.foregroundTiles.push((name.zoom+1)+'_'+tr+'_'+tc); 
                    WMTSCalls.push(this.singleTileFetcher(tc, tr,this.foregroundMatrix));
                }
        return WMTSCalls;
     };

     ns.ThreeDMap.prototype.backGroundTileNeighbours=function(name){
        var WMTSCalls=[];
        var tileCol=name.tileCol;
        var tileRow=name.tileRow;
        var tileColMin=tileCol-1;
        var tileRowMin=tileRow-1;
        var tileColMax=tileCol+1;
        var tileRowMax=tileRow+1;
        // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
        for (var tc=tileColMin;tc<=tileColMax;tc++)
            for (var tr=tileRowMin;tr<=tileRowMax;tr++)
                if (this.backgroundTiles.indexOf(name.zoom+'_'+tr+'_'+tc) == -1) {
                    this.backgroundTiles.push(name.zoom+'_'+tr+'_'+tc);
                    WMTSCalls.push(this.singleTileFetcher(tc, tr,this.backgroundMatrix));
                }
        return WMTSCalls;
    };

    ns.ThreeDMap.prototype.tileLoader = function (WMTSCalls, visible) {
        for (var i = 0; i<WMTSCalls.length;i++){
            var material=null;
            var geometry=null;
            var concatName=WMTSCalls[i].zoom+'_'+ WMTSCalls[i].tileRow +'_'+WMTSCalls[i].tileCol;
            if (visible)
            {
                
                // Hack for CORS?
                THREE.ImageUtils.crossOrigin = "";

                var WCSTile =new ns.WCS( WMTSCalls[i].tileSpanX,  WMTSCalls[i].tileSpanY,dim.demWidth-1, dim.demHeight-1);
                WCSTile.wcsFetcher( WMTSCalls[i]);
                geometry=WCSTile.geometry;
                geometry.processed={
                    left: false,
                    right: false,
                    top: false,
                    bottom: false,
                    all: false
                };
                material= new THREE.MeshBasicMaterial(
                    {
                        map: THREE.ImageUtils.loadTexture(
                            WMTSCalls[i].url.cache_WMTS,
                            new THREE.UVMapping()
                        ),
                        side: THREE.DoubleSide
                    }
                );
            }
            else{
                geometry = new THREE.PlaneGeometry( WMTSCalls[i].tileSpanX,  WMTSCalls[i].tileSpanY);
                material = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
                
            }
            this.mesh =  new THREE.Mesh(
                geometry,
                material
                );
            this.mesh.position.x=WMTSCalls[i].bounds.minx+(WMTSCalls[i].tileSpanX/2);
            this.mesh.position.y=WMTSCalls[i].bounds.miny+(WMTSCalls[i].tileSpanY/2);
            this.mesh.tileName={
                zoom: WMTSCalls[i].zoom,
                tileRow: WMTSCalls[i].tileRow,
                tileCol: WMTSCalls[i].tileCol
            };
            this.mesh.name=concatName;
            this.mesh.bounds=WMTSCalls[i].bounds;
            this.mesh.url=WMTSCalls[i].url;
            this.mesh.scale.z=0.02;
            this.mesh.WMTSCall=WMTSCalls[i];
            this.tileLoaded(this.mesh, visible);
        }
    };
    
    ns.ThreeDMap.prototype.tileLoaded = function (tile, visible) {
        tile.visible=visible;
        if (visible)
        {
            this.foregroundGroup.add(tile);
        }
        else
        {
            this.backgroundGroup.add(tile);
        }
    };
    ns.ThreeDMap.prototype.neighbourTest = function (WMTSCall) {
                var name=WMTSCall.zoom+'_'+ (WMTSCall.tileRow) +'_'+WMTSCall.tileCol;
                var neighbourTop=WMTSCall.zoom+'_'+ (WMTSCall.tileRow-1) +'_'+WMTSCall.tileCol;
                var neighbourBottom=WMTSCall.zoom+'_'+ (WMTSCall.tileRow+1) +'_'+WMTSCall.tileCol;
                var neighbourLeft=WMTSCall.zoom+'_'+ WMTSCall.tileRow +'_'+(WMTSCall.tileCol -1);
                var neighbourRight=WMTSCall.zoom+'_'+ WMTSCall.tileRow +'_'+(WMTSCall.tileCol +1);

                // TODO: These need to be tested and averaged as well
                /*
                var neighbourTopLeft=WMTSCall.zoom+'_'+ (WMTSCall.tileRow -1) +'_'+(WMTSCall.tileCol -1);
                var neighbourTopRight=WMTSCall.zoom+'_'+ (WMTSCall.tileRow -1) +'_'+ (WMTSCall.tileCol; +1)
                var neighbourBottomLeft=WMTSCall.zoom+'_'+ (WMTSCall.tileRow +1) +'_'+(WMTSCall.tileCol -1);
                var neighbourBottomRight=WMTSCall.zoom+'_'+ (WMTSCall.tileRow +1) +'_'+(WMTSCall.tileCol +1);
                */

                this.geometryTester(name,neighbourLeft, 'left');
                this.geometryTester(name,neighbourRight,'right');
                this.geometryTester(name,neighbourTop,'top');
                this.geometryTester(name,neighbourBottom,'bottom');

    };
        ns.ThreeDMap.prototype.geometryTester= function (name,neighbourName, placement) {
            if (this.foregroundGroup.getObjectByName(neighbourName)) {
                var tile=this.foregroundGroup.getObjectByName(name);
                var neighbour=this.foregroundGroup.getObjectByName(neighbourName);
                if (neighbour.geometry.loaded==true){
                    if(tile.geometry.loaded==true) {
                        this.geometryFixer(tile, neighbour, placement);
                    }
                }
            }
        };
        ns.ThreeDMap.prototype.geometryFixer= function (tile, neighbour, placement) {
            var oppositeEdge;
            if (placement=='left')
                oppositeEdge='right';
            else if (placement=='right')
                oppositeEdge='left';
            else if (placement=='top')
                oppositeEdge='bottom';
            else if (placement=='bottom')
                oppositeEdge='top';
            
            for (var i =0; i< this.edges[placement].length;i++){
                tile.geometry.vertices[this.edges[placement][i]].z=(tile.geometry.vertices[this.edges[placement][i]].z+neighbour.geometry.vertices[this.edges[oppositeEdge][i]].z)/2;
                neighbour.geometry.vertices[this.edges[oppositeEdge][i]].z=tile.geometry.vertices[this.edges[placement][i]].z;
            }
            tile.geometry.verticesNeedUpdate=true;
            neighbour.geometry.verticesNeedUpdate=true;
            tile.geometry.processed[placement]=true;
            neighbour.geometry.processed[oppositeEdge]=true;
            if (tile.geometry.processed['top']==tile.geometry.processed['bottom']==tile.geometry.processed['left']==tile.geometry.processed['right'])
                tile.geometry.processed['all']=true;
            if (neighbour.geometry.processed['top']==neighbour.geometry.processed['bottom']==neighbour.geometry.processed['left']==neighbour.geometry.processed['right'])
                neighbour.geometry.processed['all']=true;                
        }
}(wxs3));
