var wxs3 = wxs3 || {};

(function (ns) {
  'use strict';

  ns.ThreeDMap = function (layers, dim) {
    var i, length;
    this.dim = dim;
    this.camera = null;
    this.scene = null;
    this.renderer = null;
    this.controls = null;
    this.foregroundMatrix = null;
    this.backgroundMatrix = null;
    this.backgroundTiles = [];
    this.foregroundTiles = [];
    this.foregroundTilesIndex = [];

    // Setting demWidth and demHeight to some fraction of 256
    // TODO: Figure out why tiff-js won't allow arrays longer than 2048
    dim.demWidth = 32;
    dim.demHeight = dim.demWidth;

    // Lets make some indexes over vertice-positions corresponding to edges and corners
    this.edges = {
      top: [],
      left: [],
      right: [],
      bottom: [],
      topLeft: [],
      bottomLeft: [],
      topRight: [],
      bottomRight: []
    };
    length = dim.demWidth * dim.demHeight;
    for (i = 0; i < length; i++) {
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

    this.edges.topLeft=this.edges.top[0];
    this.edges.topRight=this.edges.right[0];
    this.edges.bottomLeft=this.edges.bottom[0];
    this.edges.bottomRight=this.edges.bottom[this.dim.demWidth-1];



    this.dim.wmsLayers = layers;
    this.createRenderer();
    this.createScene();
    this.createCamera();
    this.createControls();
    this.foregroundGroup = new THREE.Object3D();
    this.backgroundGroup = new THREE.Object3D();
    this.foregroundGroup.scale.z = dim.zMult;
    this.scene.add(this.foregroundGroup);
    this.scene.add(this.backgroundGroup);

    // Generate tiles and boundingboxes
    this.generateTiles();
    document.getElementById('webgl').appendChild(this.renderer.domElement);
    this.render();
  };

  ns.ThreeDMap.prototype.createRenderer = function () {
    this.renderer = new THREE.WebGLRenderer(  
    { 
      //antialias: true 
    } 
      
    );
    this.renderer.setSize(this.dim.width, this.dim.height);
  };

  ns.ThreeDMap.prototype.createScene = function () {
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xeeeeee));
  };

  ns.ThreeDMap.prototype.createCamera = function () {
    var centerY, centerX, cameraHeight;
    var fov = 45;
    this.camera = new THREE.PerspectiveCamera(
      fov,
        this.dim.width / this.dim.height,
      0.1,
      5000000
    );
    // Some trig to find height for camera
    if (!!this.dim.Z) {
      cameraHeight = this.dim.Z;
    } else {
      cameraHeight = (this.dim.metersHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
    }
    // Place camera in middle of bbox
    centerX = (this.dim.minx + this.dim.maxx) / 2;
    centerY = (this.dim.miny + this.dim.maxy) / 2;
    this.camera.position.set(centerX, centerY, cameraHeight);
    this.raycaster = new THREE.Raycaster(this.camera.position, this.vector);
  };

  ns.ThreeDMap.prototype.createControls = function () {
    var centerY;
    var centerX;
    this.controls = new THREE.TrackballControls(this.camera);
    // Point camera directly down
    centerX = (this.dim.minx + this.dim.maxx) / 2;
    centerY = (this.dim.miny + this.dim.maxy) / 2;
    this.controls.target = new THREE.Vector3(centerX, centerY, 0);
  };

  ns.ThreeDMap.prototype.render = function () {
    var i;
    for (i = 0; i < this.foregroundGroup.children.length; i++) {
      if (this.foregroundGroup.children[i].scale.z < 1 && this.foregroundGroup.children[i].geometry.loaded == true) {
        this.foregroundGroup.children[i].scale.z += 0.02;

      }
      else if (this.foregroundGroup.children[i].scale.z >= 1) {
        //this.foregroundGroup.children[i].material.wireframe=false;
        if (this.foregroundGroup.children[i].geometry.processed['all'] == false) {
          this.neighbourTest(this.foregroundGroup.children[i].WMTSCall);
        }
      }
    }
    this.controls.update();
    window.requestAnimationFrame(this.render.bind(this));
    this.renderer.render(this.scene, this.camera);
    this.caster();
  };

  ns.ThreeDMap.prototype.generateTiles = function () {
    var capabilitiesURL = this.dim.wmtsUrl+'?Version=1.0.0&service=WMTS&request=getcapabilities';
    var WMTSCapabilities = new ns.WMTS(capabilitiesURL, this.dim.crs, this.dim.wmtsLayer);
    var that = this;
    WMTSCapabilities.fetchCapabilities(function (tileMatrixSet) {
      that.bbox2tiles(tileMatrixSet);
    })
  };

  ns.ThreeDMap.prototype.bbox2tiles = function (tileMatrixSet) {
    var i, tmpBounds, tileMatrix, spanDivisor, tileMatrixCount;
    var bounds = this.dim.getBounds();
    var WMTSCalls = [];
    var querySpanX = bounds.maxx - bounds.minx;
    var querySpanY = bounds.maxy - bounds.miny;
    var querySpanMin, querySpanMax, querySpanMinDim, querySpanMaxDim;

    if (querySpanX > querySpanY) {
      querySpanMin = querySpanY;
      querySpanMax = querySpanX;
      querySpanMinDim = 'y';
      querySpanMaxDim = 'x';
    }
    else {
      querySpanMin = querySpanX;
      querySpanMax = querySpanY;
      querySpanMinDim = 'x';
      querySpanMaxDim = 'y';
    }
    tileMatrixCount = tileMatrixSet.length;

    // Here we find the first matrix that has a tilespan smaller than that of the smallest dimension of the input bbox.
    // We can control the resolution of the images by altering how large a difference there must be (half, quarter etc.)
    spanDivisor = 4;
    for (tileMatrix = 0; tileMatrix < tileMatrixCount; tileMatrix++) {
      if (querySpanMinDim == 'x') {
        if (tileMatrixSet[tileMatrix].TileSpanX < querySpanMin / spanDivisor) {
          this.foregroundMatrix = tileMatrixSet[tileMatrix];
          this.backgroundMatrix = tileMatrixSet[tileMatrix - 1];
          break;
        }
      }
      else if (tileMatrixSet[tileMatrix].TileSpanY < querySpanMin / spanDivisor) {
        this.foregroundMatrix = tileMatrixSet[tileMatrix];
        this.backgroundMatrix = tileMatrixSet[tileMatrix - 1];
        break;
      }
    }
    tmpBounds = new THREE.Vector2((bounds.maxx + bounds.minx) / 2, (bounds.maxy + bounds.miny) / 2);
    WMTSCalls = this.centralTileFetcher(tmpBounds, this.backgroundMatrix);
    this.tileLoader(WMTSCalls, false);
    for (i = 0; i < WMTSCalls.length; i++) {
      this.mainTileLoader({zoom: WMTSCalls[i].zoom, tileRow: WMTSCalls[i].tileRow, tileCol: WMTSCalls[i].tileCol});

    }

  };

  ns.ThreeDMap.prototype.centralTileFetcher = function (bounds, activeMatrix) {
    var tr, tc;
    var WMTSCalls = [];
    var name = null;
    var tileCol = Math.floor((bounds.x - activeMatrix.TopLeftCorner.minx) / activeMatrix.TileSpanX);
    var tileRow = Math.floor((activeMatrix.TopLeftCorner.maxy - bounds.y) / activeMatrix.TileSpanY);
    var tileColMin = tileCol - 1;
    var tileRowMin = tileRow - 1;
    var tileColMax = tileCol + 1;
    var tileRowMax = tileRow + 1;
    // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
    for (tc = tileColMin; tc <= tileColMax; tc++)
      for (tr = tileRowMin; tr <= tileRowMax; tr++) {
        name = activeMatrix.Zoom + '_' + tr + '_' + tc;
        if (this.backgroundTiles.indexOf(name) == -1) {
          this.backgroundTiles.push(name);
          WMTSCalls.push(this.singleTileFetcher(tc, tr, activeMatrix));
        }
      }
    return WMTSCalls;
  };

  ns.ThreeDMap.prototype.singleTileFetcher = function (tileCol, tileRow, activeMatrix) {
    var WMTSCall;
    var wmsBounds = [
        activeMatrix.TopLeftCorner.minx + (tileCol * activeMatrix.TileSpanX),
        activeMatrix.TopLeftCorner.maxy - ((tileRow + 1) * activeMatrix.TileSpanY),
        activeMatrix.TopLeftCorner.minx + ((tileCol + 1) * activeMatrix.TileSpanX),
        activeMatrix.TopLeftCorner.maxy - ((tileRow) * activeMatrix.TileSpanY)
    ];
    var TileSpanY = activeMatrix.TileSpanY;
    var TileSpanX = activeMatrix.TileSpanX;
    var wcsDivisor = 2;
    var grid2rasterUnitsX = ((TileSpanX / (this.dim.demHeight - 1)));
    var grid2rasterUnitsY = ((TileSpanY / (this.dim.demWidth - 1)));
    var wcsBounds = [
      // Add some to the extents as we need to put values from a raster onto a grid. Bazingah!
      (wmsBounds[0] - (grid2rasterUnitsX / wcsDivisor)), //minx
      (wmsBounds[1] - (grid2rasterUnitsY / wcsDivisor)), //miny
      (wmsBounds[2] + (grid2rasterUnitsX / wcsDivisor)), //maxx
      (wmsBounds[3] + (grid2rasterUnitsY / wcsDivisor)) //maxy
    ];
    WMTSCall = {
      tileSpanX: TileSpanX,
      tileSpanY: TileSpanY,
      tileRow: tileRow,
      tileCol: tileCol,
      zoom: activeMatrix.Zoom,
      // Setting these for easy debugging
      // TODO: define parameters here for reuse later on
      url: {
        cache_WMTS: this.dim.wmtsUrl+'?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&Style=default&Format=image/png&Layer='+ this.dim.wmtsLayer+'&TileMatrixSet=' + activeMatrix.TileMatrixSetIdentifier + '&TileMatrix=' + activeMatrix.Identifier + '&TileRow=' + tileRow + '&TileCol=' + tileCol,
        cache_wms: this.dim.wmscUrl +'REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&Layer=topo2&Style=default&Format=image/png&width=256&height=256&crs=EPSG:' + activeMatrix.Identifier.split(':')[1] + '&BBOX=' + wmsBounds.join(','),
        wms: this.dim.wmsUrl + '?GKT='+this.dim.gatekeeperTicket+'&REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&Layers='+this.dim.wmsLayers+'&Style=default&Format=image/jpeg&WIDTH=256&HEIGHT=256&SRS=EPSG:' + activeMatrix.Identifier.split(':')[1] + '&BBOX=' + wmsBounds.join(','),
        //wcs 1.1.0 NOT WORKING with XYZ - needs to drop xml-part to use tiff-js?
        //wcs: 'http://wcs.geonorge.no/skwms1/wcs.dtm?SERVICE=WCS&VERSION=1.1.0&REQUEST=GetCoverage&FORMAT=geotiff&IDENTIFIER=all_50m&BOUNDINGBOX='+ wcsBounds.join(',')  +',urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridBaseCRS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridCS=urn:ogc:def:crs:EPSG::'+activeMatrix.Identifier.split(':')[1] + '&GridType=urn:ogc:def:method:WCS:1.1:2dGridIn2dCrs&GridOrigin=' +wmsBounds[0] +',' +wmsBounds[1] +'&GridOffsets='+grid2rasterUnitsX +',' +grid2rasterUnitsY + '&RangeSubset=50m:average' //[bands[1]]'
        wcs: this.dim.wcsUrl+'?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT=geotiff&WIDTH=' + parseInt(dim.demWidth) + '&HEIGHT=' + parseInt(dim.demWidth) + '&COVERAGE=' + dim.coverage + '&crs=EPSG:' + this.dim.crs + '&BBOX=' + wcsBounds.join(',') // + '&INTERPOLATION=BILINEAR' //+'&RESPONSE_CRS=EPSG:'+activeMatrix.Identifier.split(':')[1] //+ '&RangeSubset=50m:average[bands[1]]' +'&RESX='+grid2rasterUnitsX+'&RESY='+grid2rasterUnitsY
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

  ns.ThreeDMap.prototype.caster = function () {
    var tileName = null;
    this.vector = new THREE.Vector3(0, 0, -1);
    this.vector.applyQuaternion(this.camera.quaternion);
    this.raycaster = new THREE.Raycaster(this.camera.position, this.vector);
    this.intersects = this.raycaster.intersectObjects(this.backgroundGroup.children);
    if (this.intersects.length > 0) {
      tileName = this.intersects[0].object.tileName;
      this.mainTileLoader(tileName);

    }
  };
  ns.ThreeDMap.prototype.mainTileLoader = function (tileName) {
    var neighbourCall;
    var neighbourCalls = this.backGroundTileNeighbours(tileName);
    // add foreground
    var children = this.tileChildren(tileName);
    this.tileLoader(children, true);
    // add backgound
    for (neighbourCall = 0; neighbourCall < neighbourCalls.length; neighbourCall++) {
      this.tileLoader([ neighbourCalls[neighbourCall] ], false);
    }
    // remove processed background
    // TODO: Find out if we need to run geometry.dispose() first.
    this.backgroundGroup.getObjectByName(tileName.zoom + '_' + tileName.tileRow + '_' + tileName.tileCol).geometry.dispose();
    this.backgroundGroup.remove(this.backgroundGroup.getObjectByName(tileName.zoom + '_' + tileName.tileRow + '_' + tileName.tileCol));
  };

  ns.ThreeDMap.prototype.tileChildren = function (tileName) {
    var tr, tc;
    var WMTSCalls = [];
    var tileCol = tileName.tileCol * 2;
    var tileRow = tileName.tileRow * 2;
    var tileColMin = tileCol;
    var tileRowMin = tileRow;
    var tileColMax = tileCol + 1;
    var tileRowMax = tileRow + 1;
    // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
    for (tc = tileColMin; tc <= tileColMax; tc++)
      for (tr = tileRowMin; tr <= tileRowMax; tr++)
        //if (this.foregroundTiles.indexOf(name.zoom+'_'+tr+'_'+tc) ==-1) {
        if (typeof this.foregroundGroup.getObjectByName(tileName.zoom + '_' + tr + '_' + tc) === "undefined") {
          // Add tile to index over loaded tiles
          // TODO: Do we still use this?
          this.foregroundTiles.push((tileName.zoom + 1) + '_' + tr + '_' + tc);
          WMTSCalls.push(this.singleTileFetcher(tc, tr, this.foregroundMatrix));
        }
    return WMTSCalls;
  };

  ns.ThreeDMap.prototype.backGroundTileNeighbours = function (tileName) {
    var tr, tc;
    var WMTSCalls = [];
    var tileCol = tileName.tileCol;
    var tileRow = tileName.tileRow;
    var tileColMin = tileCol - 1;
    var tileRowMin = tileRow - 1;
    var tileColMax = tileCol + 1;
    var tileRowMax = tileRow + 1;
    // Here we generate tileColumns and tileRows as well as  translate tilecol and tilerow to boundingboxes
    for (tc = tileColMin; tc <= tileColMax; tc++)
      for (tr = tileRowMin; tr <= tileRowMax; tr++){
      // TODO: Why do we still use this instead of backgroundGroup.getObjectByName()
      if (this.backgroundTiles.indexOf(tileName.zoom + '_' + tr + '_' + tc) == -1) {
          this.backgroundTiles.push(tileName.zoom + '_' + tr + '_' + tc);
          WMTSCalls.push(this.singleTileFetcher(tc, tr, this.backgroundMatrix));
        }
      }
    return WMTSCalls;
  };

  ns.ThreeDMap.prototype.tileLoader = function (WMTSCalls, visible) {
    var WCSTile, concatName, geometry, material, i;
    for (i = 0; i < WMTSCalls.length; i++) {
      material = null;
      geometry = null;
      concatName = WMTSCalls[i].zoom + '_' + WMTSCalls[i].tileRow + '_' + WMTSCalls[i].tileCol;
      if (visible) {
        // Hack for CORS?
        THREE.ImageUtils.crossOrigin = "";

        WCSTile = new ns.WCS(WMTSCalls[i].tileSpanX, WMTSCalls[i].tileSpanY, dim.demWidth - 1, dim.demHeight - 1);
        WCSTile.wcsFetcher(WMTSCalls[i]);
        geometry = WCSTile.geometry;
        geometry.processed = {
          left: false,
          right: false,
          top: false,
          bottom: false,
          topLeft: false,
          topRight: false,
          bottomLeft: false,
          bottomRight: false,
          allSides: false,
          all: false
        };

        var activeUrl;
        if (this.dim.wmsUrl)
          activeUrl=WMTSCalls[i].url.wms;
        else
          activeUrl=WMTSCalls[i].url.cache_WMTS;

        // TODO: Create a loader for images based on the WCS-loader. This allows us to check if the image actually loads and reload if something fails. Also, we can use wireframes as a placeholder.
        material = new THREE.MeshBasicMaterial(
          {
            
            map: THREE.ImageUtils.loadTexture(
              activeUrl,
              new THREE.UVMapping()
            ),

            //side: THREE.DoubleSide
            //wireframe: true
          }
        );
        //material.depthWrite=false;
        //material.map.image.hidden=true;
      }
      else {
        geometry = new THREE.PlaneGeometry(WMTSCalls[i].tileSpanX, WMTSCalls[i].tileSpanY);
        material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
      }
      this.mesh = new THREE.Mesh(
        geometry,
        material
      );
      this.mesh.position.x = WMTSCalls[i].bounds.minx + (WMTSCalls[i].tileSpanX / 2);
      this.mesh.position.y = WMTSCalls[i].bounds.miny + (WMTSCalls[i].tileSpanY / 2);
      this.mesh.tileName = {
        zoom: WMTSCalls[i].zoom,
        tileRow: WMTSCalls[i].tileRow,
        tileCol: WMTSCalls[i].tileCol
      };
      this.mesh.name = concatName;
      this.mesh.bounds = WMTSCalls[i].bounds;
      this.mesh.url = WMTSCalls[i].url;
      this.mesh.scale.z = 0.02;
      this.mesh.WMTSCall = WMTSCalls[i];
      this.tileLoaded(this.mesh, visible);
    }
  };

  ns.ThreeDMap.prototype.tileLoaded = function (tile, visible) {
    tile.visible = visible;
    if (visible) {
      this.foregroundGroup.add(tile);
    }
    else {
      this.backgroundGroup.add(tile);
    }
  };

  ns.ThreeDMap.prototype.neighbourTest = function (WMTSCall) {
    var name = WMTSCall.zoom + '_' + (WMTSCall.tileRow) + '_' + WMTSCall.tileCol;
    var neighbours={
      top: WMTSCall.zoom + '_' + (WMTSCall.tileRow - 1) + '_' + WMTSCall.tileCol,
      bottom: WMTSCall.zoom + '_' + (WMTSCall.tileRow + 1) + '_' + WMTSCall.tileCol,
      left: WMTSCall.zoom + '_' + WMTSCall.tileRow + '_' + (WMTSCall.tileCol - 1),
      right: WMTSCall.zoom + '_' + WMTSCall.tileRow + '_' + (WMTSCall.tileCol + 1),
      topLeft: WMTSCall.zoom+'_'+ (WMTSCall.tileRow -1) +'_'+(WMTSCall.tileCol -1),
      topRight: WMTSCall.zoom+'_'+ (WMTSCall.tileRow -1) +'_'+ (WMTSCall.tileCol +1),
      bottomLeft: WMTSCall.zoom+'_'+ (WMTSCall.tileRow +1) +'_'+(WMTSCall.tileCol -1),
      bottomRight: WMTSCall.zoom+'_'+ (WMTSCall.tileRow +1) +'_'+(WMTSCall.tileCol +1)
   }
     
    var tile = this.foregroundGroup.getObjectByName(name);
    // If the tile is already processed on edges we skip
    if(!tile.geometry.processed['allSides']){
      if (!tile.geometry.processed['top']){
        this.geometryEdgeTester(tile, neighbours['top'], 'top');
      }
      if (!tile.geometry.processed['bottom']){
        this.geometryEdgeTester(tile, neighbours['bottom'], 'bottom');
      }
      if (!tile.geometry.processed['left']){
        this.geometryEdgeTester(tile, neighbours['left'], 'left');
      }
      if (!tile.geometry.processed['right']){
        this.geometryEdgeTester(tile, neighbours['right'], 'right');
      }
    }
    // Test if neighbours are loaded
    else
    {
      if (!tile.geometry.processed['topLeft']){
        this.geometryCornerTester(tile,
          [ neighbours['topLeft'],
            neighbours['left'],
            neighbours['top']
          ],
          [ 'topLeft',
            'left',
            'top'
          ]);
      }
      if (!tile.geometry.processed['bottomLeft']){
        this.geometryCornerTester(tile,
          [ neighbours['bottomLeft'],
            neighbours['left'],
            neighbours['bottom']
          ],
          [ 'bottomLeft',
            'left',
            'bottom'
          ]);
      }
      if (!tile.geometry.processed['bottomRight']){
        this.geometryCornerTester(tile,
          [ neighbours['bottomRight'],
            neighbours['right'],
            neighbours['bottom']
          ],
          [ 'bottomRight',
            'right',
            'bottom'
          ]);
      }
      if (!tile.geometry.processed['topRight']){
        this.geometryCornerTester(tile,
          [ neighbours['topRight'],
            neighbours['right'],
            neighbours['top']
          ],
          [ 'topRight',
            'right',
            'top'
          ]);
      }

    }
  };

  ns.ThreeDMap.prototype.geometryEdgeTester = function (tile, neighbourName, placement) {
    var neighbour; //, tile;
    if (this.foregroundGroup.getObjectByName(neighbourName)) {
      neighbour = this.foregroundGroup.getObjectByName(neighbourName);
      if (neighbour.geometry.loaded == true && neighbour.scale.z >= 1) {
        if (tile.geometry.loaded == true) {
          this.geometryEdgeFixer(tile, neighbour, placement);
        }
      }
      
    }
  };


  ns.ThreeDMap.prototype.geometryEdgeFixer = function (tile, neighbour, placement) {
    var i, oppositeEdge;
    // Edges
    oppositeEdge ={
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
      topLeft: 'bottomRight',
      bottomRight: 'topLeft',
      topRight: 'bottomLeft',
      bottomLeft: 'topRight'
    }

    for (i = 0; i < this.edges[placement].length; i++) {
      tile.geometry.vertices[this.edges[placement][i]].z = (tile.geometry.vertices[this.edges[placement][i]].z + neighbour.geometry.vertices[this.edges[oppositeEdge[placement]][i]].z) / 2;
      neighbour.geometry.vertices[this.edges[oppositeEdge[placement]][i]].z = tile.geometry.vertices[this.edges[placement][i]].z;
    }
    tile.geometry.verticesNeedUpdate = true;
    neighbour.geometry.verticesNeedUpdate = true;
    tile.geometry.processed[placement] = true;
    neighbour.geometry.processed[oppositeEdge[placement]] = true;
    if (tile.geometry.processed['top'] & tile.geometry.processed['bottom'] & tile.geometry.processed['left'] & tile.geometry.processed['right'] ){
      tile.geometry.processed['allSides'] = true;
      if ( tile.geometry.processed['topLeft'] & tile.geometry.processed['bottomLeft'] & tile.geometry.processed['bottomRight'] & tile.geometry.processed['topRight'] )
        tile.geometry.processed['all'] = true;
    }
    if (neighbour.geometry.processed['top'] & neighbour.geometry.processed['bottom'] & neighbour.geometry.processed['left'] & neighbour.geometry.processed['right'] ){
      neighbour.geometry.processed['allSides'] = true;
      if (neighbour.geometry.processed['topLeft'] & neighbour.geometry.processed['bottomLeft'] & neighbour.geometry.processed['bottomRight'] & neighbour.geometry.processed['topRight'] )
        neighbour.geometry.processed['all'] = true;
    }
  };


    ns.ThreeDMap.prototype.geometryCornerTester = function (tile, neighbourNames, placements) {
    var neighbour; //, tile;
    var neighbours=[];
    if (tile.geometry.loaded == true) {
      for (var i in placements){
          if (this.foregroundGroup.getObjectByName(neighbourNames[i])) {
            var neighbour=this.foregroundGroup.getObjectByName(neighbourNames[i]);
            // Populate array with neighbour
            if (neighbour.geometry.loaded == true && neighbour.scale.z >= 1) {
              neighbours.push(neighbour);
          }
        }
      }
    }
    // Check to see if we have all neighbours
    if(neighbours.length==3)
      this.geometryCornerFixer(tile, neighbours, placements);
  };

    ns.ThreeDMap.prototype.geometryCornerFixer = function (tile, neighbours, placements) {
    // Index to invert corners
    // TODO: This is not very easy to read. Might need a better solution
    // TODO: This is constant and should be defined only once
    var oppositeCorners={
      topLeft: {
        topLeft: 'bottomRight',
        left: 'topRight',
        top: 'bottomLeft'
      },
      bottomRight: {
        bottomRight: 'topLeft',
        right: 'bottomLeft',
        bottom:'topRight'
      },
      topRight: {
        topRight: 'bottomLeft',
        right: 'topLeft',
        top: 'bottomRight'
      },
      bottomLeft: {
        bottomLeft: 'topRight',
        left: 'bottomRight',
        bottom: 'topLeft'
      }
    }

    // Calculate average height
    var averageHeightCorner=
      (
      tile.geometry.vertices[this.edges[placements[0]]].z +
      neighbours[0].geometry.vertices[this.edges[
      oppositeCorners[placements[0]][placements[0]]
      ]].z +
      neighbours[1].geometry.vertices[this.edges[
      oppositeCorners[placements[0]][placements[1]]
      ]].z +
      neighbours[2].geometry.vertices[this.edges[
      oppositeCorners[placements[0]][placements[2]]
      ]].z
      ) /4;

    // Set vertex on tile and neighbours to average value
    tile.geometry.vertices[this.edges[placements[0]]].z=averageHeightCorner;
    neighbours[0].geometry.vertices[this.edges[
    oppositeCorners[placements[0]][placements[0]]
    ]].z=averageHeightCorner;
    neighbours[1].geometry.vertices[this.edges[
    oppositeCorners[placements[0]][placements[1]]
    ]].z=averageHeightCorner;
    neighbours[2].geometry.vertices[this.edges[
    oppositeCorners[placements[0]][placements[2]]
    ]].z=averageHeightCorner;

    // Flag for update
    tile.geometry.verticesNeedUpdate=true;
    neighbours[0].geometry.verticesNeedUpdate=true;
    neighbours[1].geometry.verticesNeedUpdate=true;
    neighbours[2].geometry.verticesNeedUpdate=true;

    // Flag corners as processed
    tile.geometry.processed[placements[0]]=true;
    neighbours[0].geometry.processed[oppositeCorners[placements[0]][placements[0]]]=true;
    neighbours[1].geometry.processed[oppositeCorners[placements[0]][placements[1]]]=true;
    neighbours[2].geometry.processed[oppositeCorners[placements[0]][placements[2]]]=true;

    // Check if all corners are averaged and flag if so
    if ( tile.geometry.processed['topLeft'] & tile.geometry.processed['bottomLeft'] & tile.geometry.processed['bottomRight'] & tile.geometry.processed['topRight'] )
      tile.geometry.processed['all'] = true;
    for (var i =0; i<3;i++){
      if (neighbours[i].geometry.processed['topLeft'] & neighbours[i].geometry.processed['bottomLeft'] & neighbours[i].geometry.processed['bottomRight'] & neighbours[i].geometry.processed['topRight'] )
        neighbours[i].geometry.processed['all'] = true;
    }
  }
}(wxs3));
