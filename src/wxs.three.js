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

        // Setting demWidth and demHeight to some fraction of 256
        dim.demWidth=32;
        dim.demHeight=dim.demWidth;
        
        // Lets make some indexes with vertice-positions corresponding to edges. 
        // Not in user, but keep for future reference
        this.edges={
            top: [],
            left: [],
            right: [],
            bottom: []
        };
        var length=dim.demWidth*dim.demHeight;
        for (var i=0; i<length; i++)
            if (i<this.dim.demWidth) {
                this.edges.top.push(i);
                if (i==0){
                    this.edges.left.push(i);
                }
                else if (i==this.dim.demWidth-1) {
                    this.edges.right.push(i);
                }
            }
            else if (i>=length-this.dim.demWidth) {
                this.edges.bottom.push(i);
                if (i==length-this.dim.demWidth){
                    this.edges.left.push(i);
                }
                else if (i==length-1) {
                    this.edges.right.push(i);
                }
            }
            else if ( i % this.dim.demWidth ==0 ) this.edges.left.push(i);
            else if ((i+1) % this.dim.demWidth ==0 ) this.edges.right.push(i);

        this.dim.wmsLayers = layers;
        this.createRenderer();
        this.createScene();
        this.createCamera();
        this.createControls();
        this.foregroundGroup = new THREE.Object3D();
        this.backgroundGroup = new THREE.Object3D();
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
        for (var tileMatrix=0; tileMatrix < tileMatrixCount; tileMatrix++){
            if(querySpanMinDim='x')
                if (tileMatrixSet[tileMatrix].TileSpanX<querySpanMin/1){
                    this.foregroundMatrix=tileMatrixSet[tileMatrix];
                    this.backgroundMatrix=tileMatrixSet[tileMatrix-1];
                    break;
                }
            else
                if (tileMatrixSet[tileMatrix].TileSpanX<querySpanMin/1){
                    this.foregroundMatrix=tileMatrixSet[tileMatrix];
                    this.backgroundMatrix=tileMatrixSet[tileMatrix-1];
                    break;
                }
        }
        var tmpBounds=new THREE.Vector2((bounds.maxx+bounds.minx)/2, (bounds.maxy+bounds.miny)/2);
        WMTSCalls=this.centralTileFetcher(tmpBounds, this.backgroundMatrix);
        this.tileLoader(WMTSCalls, false);

    };
    
    ns.ThreeDMap.prototype.centralTileFetcher = function (bounds, activeMatrix){
        var WMTSCalls=[];
        var tileCol=Math.floor((bounds.x-activeMatrix.TopLeftCorner.minx)/activeMatrix.TileSpanX);
        var tileRow=Math.floor((activeMatrix.TopLeftCorner.maxy-bounds.y)/activeMatrix.TileSpanY);
        var tileColMin=tileCol-1;
        var tileRowMin=tileRow-1;
        var tileColMax=tileCol+1;
        var tileRowMax=tileRow+1;
        // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
        for (var tc=tileColMin;tc<=tileColMax;tc++)
            for (var tr=tileRowMin;tr<=tileRowMax;tr++)
                WMTSCalls.push(this.singleTileFetcher(tc, tr,activeMatrix));
        return WMTSCalls;
    }
    
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
                //wcs 1.1.0 NOT WORKING with XYZ: 'http://wcs.geonorge.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.1.0&REQUEST=GetCoverage&FORMAT=XYZ&IDENTIFIER=all_50m&BOUNDINGBOX='+ wcsBounds.join(',')  +',urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridBaseCRS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridCS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridType=urn:ogc:def:method:WCS:1.1:2dGridIn2dCrs&GridOrigin=' +wmsBounds[0] +',' +wmsBounds[1] +'&GridOffsets='+grid2rasterUnitsX +',' +grid2rasterUnitsY + '&RangeSubset=50m:average' //[bands[1]]'
                wcs: 'http://wcs.geonorge.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=geotiff&WIDTH='+parseInt(dim.demWidth)+'&HEIGHT='+parseInt(dim.demWidth)+ '&COVERAGE=all_50m&crs=EPSG:'+activeMatrix.Identifier.split(':')[1]+'&BBOX='+ wcsBounds.join(',') //+ '&INTERPOLATION=BILINEAR' //+'&RESPONSE_CRS=EPSG:'+activeMatrix.Identifier.split(':')[1] //+ '&RangeSubset=50m:average[bands[1]]' +'&RESX='+grid2rasterUnitsX+'&RESY='+grid2rasterUnitsY
            },
            bounds: {
                minx: wmsBounds[0],
                miny: wmsBounds[1],
                maxx: wmsBounds[2],
                maxy: wmsBounds[3] 
            }
        }
    return WMTSCall;
    }

    ns.ThreeDMap.prototype.caster=function(){
        var name=null;
        this.vector = new THREE.Vector3( 0, 0, -1 );
        this.vector.applyQuaternion( this.camera.quaternion );
        this.raycaster = new THREE.Raycaster(this.camera.position, this.vector);
        this.intersects = this.raycaster.intersectObjects(this.backgroundGroup.children);        
        if (this.intersects.length > 0) {
            name=this.intersects[0].object.tileName;
            if(!this.intersects[0].object.processed)
            {
                this.intersects[0].object.processed=true;
                this.backgroundGroup.remove(this.intersects[0].object);
                //// add foreground
                var children=this.tileChildren(name);
                this.tileLoader(children, true);
                var neighbourCalls=this.tileNeighbours(name);
                for (var neighbourCall =0; neighbourCall< neighbourCalls.length; neighbourCall ++){
                    this.tileLoader([ neighbourCalls[neighbourCall] ], false) ;
                }
            }
        }
    }

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
                if (this.foregroundTiles.indexOf(name.zoom+'_'+tr+'_'+tc) >-1); else {
                    // Add tile to index over loaded tiles
                    this.foregroundTiles.push((name.zoom+1)+'_'+tr+'_'+tc); 
                    WMTSCalls.push(this.singleTileFetcher(tc, tr,this.foregroundMatrix));
                }
        return WMTSCalls;
     }

     ns.ThreeDMap.prototype.tileNeighbours=function(name){
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
                if (this.backgroundTiles.indexOf(name.zoom+'_'+tr+'_'+tc) >-1); else {
                    this.backgroundTiles.push(name.zoom+'_'+tr+'_'+tc);
                    WMTSCalls.push(this.singleTileFetcher(tc, tr,this.backgroundMatrix));
                }
        return WMTSCalls;
    }

    ns.ThreeDMap.prototype.tileLoader = function (WMTSCalls, visible) {
        for (var i = 0; i<WMTSCalls.length;i++){
            var material=null;
            var geometry=null;
            var concatName=WMTSCalls[i].zoom+'_'+ WMTSCalls[i].tileRow +'_'+WMTSCalls[i].tileCol;
            if (visible)
            {
                
                // Hack for CORS?
                THREE.ImageUtils.crossOrigin = "";
                // Keep this for future reference
                /*
                // Check for neighbours
                if (this.foregroundTiles.indexOf(WMTSCalls[i].zoom+'_'+ (WMTSCalls[i].tileRow-1) +'_'+WMTSCalls[i].tileCol) > -1) {
                    //console.log('has neighbour left');
                }
                if (this.foregroundTiles.indexOf(WMTSCalls[i].zoom+'_'+ (WMTSCalls[i].tileRow+1) +'_'+WMTSCalls[i].tileCol) > -1) {
                    //console.log('has neighbour right');
                }
                if (this.foregroundTiles.indexOf(WMTSCalls[i].zoom+'_'+ WMTSCalls[i].tileRow +'_'+(WMTSCalls[i].tileCol -1)) > -1) {
                    //console.log('has neighbour top');
                }
                if (this.foregroundTiles.indexOf(WMTSCalls[i].zoom+'_'+ WMTSCalls[i].tileRow +'_'+(WMTSCalls[i].tileCol +1)) > -1) {
                    //console.log('has neighbour bottom');
                }
                */
                var WCSTile =new ns.WCS( WMTSCalls[i].tileSpanX,  WMTSCalls[i].tileSpanY,dim.demWidth-1, dim.demHeight-1);
                WCSTile.wcsFetcher( WMTSCalls[i]);
                var geometry=WCSTile.geometry;
                var material= new THREE.MeshBasicMaterial(
            {
                map: THREE.ImageUtils.loadTexture(
                    WMTSCalls[i].url.cache_WMTS,
                    new THREE.UVMapping()
                ),
                side: THREE.DoubleSide
            });
            }
            else{
                var geometry = new THREE.PlaneGeometry( WMTSCalls[i].tileSpanX,  WMTSCalls[i].tileSpanY);
                var material = new THREE.MeshBasicMaterial( { color: 0xff0000, wireframe: true } );
                
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
            }          
            this.mesh.name=concatName;
            this.mesh.bounds=WMTSCalls[i].bounds;
            this.mesh.url=WMTSCalls[i].url;
            this.mesh.scale.z=dim.zMult;          
            this.tileLoaded(this.mesh, visible);
        };
    };
    
    ns.ThreeDMap.prototype.tileLoaded = function (tile, visible) {
        tile.visible=visible;
        if (visible)
            this.foregroundGroup.add(tile);
        else
            this.backgroundGroup.add(tile);
    };
}(wxs3));