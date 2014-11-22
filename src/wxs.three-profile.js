var wxs3 = wxs3 || {};

(function (ns) {
	'use strict';

	ns.ThreeDMap = function (dim) {
		var i, length;
		this.dim = dim;
		this.reloadTimer = -1;
		this.height = [];
		this.midHeight = null;
		this.wcsFormat = "geotiff"; //XYZ, geotiff

		this.renderer =	this.createRenderer();	
		this.camera = 	this.createCamera();
		this.controls = this.createControls();
		this.geometry = this.createGeometry();	
		
		this.wcsFetcher();
		
		this.material = this.createMaterial();
		this.mesh = 	this.createMesh(this.geometry, this.material);
		this.scene = 	this.createScene(this.mesh);

		//Add webgl canvas to div
		this.dim.div.appendChild(this.renderer.domElement);
				
		//Start renderer and listen to changes in geometry
		this.render();
		
		//Adust canvas if container is resized
		window.addEventListener('resize', this.resizeMe.bind(this), false);
	};
	
	ns.ThreeDMap.prototype.createRenderer = function () {
		var renderer = new THREE.WebGLRenderer({
			alpha: true/*,
			antialias: true*/
		});
		renderer.setSize(this.dim.width, this.dim.height);

		return renderer;
	};

	ns.ThreeDMap.prototype.createScene = function (mesh) {  
		var scene = new THREE.Scene();
		scene.add(new THREE.AmbientLight(0xeeeeee));
		scene.add(mesh);
		return scene;
	};

	ns.ThreeDMap.prototype.createCamera = function () {
		var camera, cameraHeight,
		fov = 45;
	
		camera = new THREE.PerspectiveCamera(
			fov,
			this.dim.width / this.dim.height,
			0.1,
			1000
		);

		// Some trig to find height for camera
		if (!!this.dim.Z) {
			cameraHeight = this.dim.Z;
		} else {
			//Adapt optimal side length according to canvas
			var sideLength;
			var canvCoefficient = this.dim.width / this.dim.height;
			if (canvCoefficient<(this.dim.demWidth/this.dim.demHeight)){
				sideLength = this.dim.demWidth / canvCoefficient;
			} else {
				sideLength = this.dim.demHeight;
			}
			
			//calculate camera height
			cameraHeight = (sideLength / 2) / Math.tan((fov / 2) * Math.PI / 180);
		}
		//console.log("cameraHeight",cameraHeight);

		camera.position.set(0, 0, cameraHeight);
		camera.lookAt(0, 0, 0);//need this? - see below: this.controls.target
		
		return camera;
	};
  
	ns.ThreeDMap.prototype.createGeometry = function(){
		var geometry;
		geometry = new THREE.PlaneGeometry(this.dim.demWidth, this.dim.demHeight, this.dim.demWidth-1, this.dim.demHeight-1);

		return geometry;
	};


	ns.ThreeDMap.prototype.profileFetcher = function () {
		//json response for profile metadata db query
		var crsDestination = this.dim.crs,
			profile = [//Bbox32: 528887,7005717,574049,7081214 //Bbox33: 234173,7012909,272075,7092359
			{
				name: "Profile 0",
				imgUrl: "img/trondheim_A_test_alpha_1.png",
				CRS: "EPSG:32632",
				xyStart: {x: 528887, y: 7081214},
				xyEnd: {x: 574049, y: 7005717},
				zStart: 900,
				zEnd: -1406
			}/*,
			{
				name: "Profile 1",
				imgUrl: "/website/webgl/img/trondheim_A_test_alpha_1.png",
				CRS: "EPSG:32632",
				xyStart: {x: 570000, y: 7070000},
				xyEnd: {x: 540000, y: 7010000},
				zStart: 900,
				zEnd: -1406
			}*/
		];
		/*
		var profileCall = "getProfiles?type=all&bbox=528887,7005717,574049,7081214";
		var profileRequest = new XMLHttpRequest();
    	profileRequest.open('GET', profileCall, true);		
		profileRequest.onreadystatechange = function () {}
		*/
		
		//transformation parameters kX, kY
		var verticeCount = this.geometry.vertices.length,
			modelLL = this.geometry.vertices[verticeCount-this.dim.demWidth],
			modelUR = this.geometry.vertices[this.dim.demWidth-1],
			kX = ((modelUR.x - modelLL.x) / this.dim.metersWidth),
			kY = ((modelUR.y - modelLL.y) / this.dim.metersHeight);
		
		//loop trought profiles
		for (var i=0; i<profile.length; i++){
			var verticalGeometry=new THREE.PlaneGeometry(1, 1),
				verticalMaterial=new THREE.MeshBasicMaterial({
				//verticalMaterial=new THREE.MeshPhongMaterial({
					map: THREE.ImageUtils.loadTexture(profile[i].imgUrl),
					side: THREE.DoubleSide,
					transparent: true
				}),
				crsSource = profile[i].CRS;
				
			//Check and transform to another map projection
			
			if (crsSource !== crsDestination){
				var pointStart = this.transformPoint(crsSource,crsDestination,profile[i].xyStart.x,profile[i].xyStart.y),
					pointEnd = this.transformPoint(crsSource,crsDestination,profile[i].xyEnd.x,profile[i].xyEnd.y);
					profile[i].xyStart.x = pointStart.x; profile[i].xyStart.y = pointStart.y;
					profile[i].xyEnd.x = pointEnd.x; profile[i].xyEnd.y = pointEnd.y;
			}

			//Local transformation
			var newStartX = kX*profile[i].xyStart.x - kX*this.dim.envelope[0] - (this.dim.demWidth/2),
				newStartY = kY*profile[i].xyStart.y - kY*this.dim.envelope[1] - (this.dim.demHeight/2),
				newEndX = kX*profile[i].xyEnd.x - kX*this.dim.envelope[0] - (this.dim.demWidth/2),
				newEndY = kY*profile[i].xyEnd.y - kY*this.dim.envelope[1] - (this.dim.demHeight/2),
				newStartZ = profile[i].zStart - this.midHeight,
				newEndZ = profile[i].zEnd - this.midHeight,
				verticalMesh=new THREE.Mesh(verticalGeometry, verticalMaterial);
  
			//console.log(profile[i].name+":", newStartX, newStartY, newEndX, newEndY);
  
			//XY
			verticalMesh.geometry.vertices[0].x=newStartX;
			verticalMesh.geometry.vertices[0].y=newStartY;
			verticalMesh.geometry.vertices[1].x=newEndX;
			verticalMesh.geometry.vertices[1].y=newEndY;
			verticalMesh.geometry.vertices[2].x=newStartX
			verticalMesh.geometry.vertices[2].y=newStartY;
			verticalMesh.geometry.vertices[3].x=newEndX;
			verticalMesh.geometry.vertices[3].y=newEndY;
			//Z
			profile[i].zStart - this.midHeight;
			verticalMesh.geometry.vertices[0].z=newStartZ/this.dim.zMult; //900/zMult;
			verticalMesh.geometry.vertices[1].z=newStartZ/this.dim.zMult; //900/zMult;//
			verticalMesh.geometry.vertices[2].z=newEndZ/this.dim.zMult; //-1406/zMult;
			verticalMesh.geometry.vertices[3].z=newEndZ/this.dim.zMult; //-1406/zMult;

			this.scene.add(verticalMesh);
		}
	};

	ns.ThreeDMap.prototype.transformPoint = function(sSource,sDest,x,y) {
	//Transformation of point
	//sSource,sDest: string EPSG kode
	//x,y: coordinates
		if (typeof x=="string"){x=1.0*x;y=1.0*y;}
		var point = new proj4.toPoint([x,y]);
		proj4.transform(new proj4.Proj(sSource), new proj4.Proj(sDest), point);
		return point;
	};
		
	ns.ThreeDMap.prototype.wcsFetcher = function () {
		var _this = this, format = this.wcsFormat,
			isTiff = Boolean(this.wcsFormat == "geotiff"),
			tiffArray,tiffParser;
    	var demRequest = new XMLHttpRequest();
		var wcsCall = this.dim.wcsUrl+"?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage&FORMAT="+format+"&COVERAGE="+this.dim.coverage+
			"&bbox="+this.dim.bbox+"&CRS="+this.dim.crs+"&RESPONSE_CRS="+this.dim.crs+
			"&WIDTH="+this.dim.demWidth+"&HEIGHT="+this.dim.demHeight;

		//console.log("wcsCall",wcsCall);
    	demRequest.open('GET', wcsCall, true);
		if (isTiff) demRequest.responseType = 'arraybuffer';
		
    	demRequest.onreadystatechange = function () {
			if (this.readyState === 4) {
				var lines;
				//console.log(_this.wcsFormat, isTiff);
				var minHeight=10000, maxHeight=-10000;

				if (isTiff){//geotiff
					tiffParser = new TIFFParser();
					tiffArray = tiffParser.parseTIFF(this.response);
					lines = tiffArray;
				} else {//ZYZ
					var lines= this.responseText.split("\n");
				}

				//console.log(lines.length + ' ' + _this.geometry.vertices.length);				

				//loop trought heights and calculate midHeigth
				if (isTiff){//geotiff
					var i = -1;
					for (var j=0; j<lines.length; j++){
						for (var k=0; k<lines[j].length;  k++){
							_this.height[++i] = parseInt(lines[j][k][0]);//Number?
							if (_this.height[i]<minHeight) minHeight = _this.height[i];
							else if (_this.height[i]>maxHeight) maxHeight = _this.height[i];
						}
					}
				} else {//XYZ
					for (var i = 0, l = _this.geometry.vertices.length; i < l; i++) {
						_this.height[i] = parseInt(lines[i].split(' ')[2]);
						if (_this.height[i]<minHeight) minHeight = _this.height[i];
						else if (_this.height[i]>maxHeight) maxHeight = _this.height[i];
					}
				}
				
				//The Vertical center of the height model is adjusted to (min + max) / 2.
				//If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level,
				//a tipping of the model will cause the map to disappear over the screen top without this adjustment.
				//On a computer you can move the model down width a right-click-drag, but not on a mobile device.
				_this.midHeight = (maxHeight + minHeight) / 2;
				
				//console.log(minHeight, maxHeight, _this.midHeight);
				//console.log("vertices,zMult",_this.geometry.vertices.length,_this.dim.zMult);
				
				//assign vertices and adjust z values according to _this.midHeight
				for (var i = 0, l = _this.geometry.vertices.length; i < l; i++) {
					_this.geometry.vertices[i].z = ((_this.height[i]-_this.midHeight)/_this.dim.zMult);
				}
			
				_this.geometry.loaded = true;
   		 		_this.geometry.verticesNeedUpdate = true;
				
				_this.profileFetcher();
			}
    	};
    	demRequest.send();
  	};

	ns.ThreeDMap.prototype.createMaterial = function(){
		var imageCall;
		if (this.dim.imgUrl){//IMAGE
			imageCall = this.dim.imgUrl;	
		} else {//WMS
			imageCall = this.dim.wmsUrl+"?service=wms&version=1.1.1&request=getmap&crs="+this.dim.crs+"&srs="+this.dim.crs+
				//"&WIDTH="+this.dim.demWidth*this.dim.wmsMult+"&HEIGHT="+this.dim.demHeight*this.dim.wmsMult+
				"&WIDTH="+this.dim.imgWidth+"&HEIGHT="+this.dim.imgHeight+
				"&bbox="+this.dim.bbox+"&layers="+this.dim.wmsLayers+"&format="+this.dim.wmsFormat+this.dim.wmsFormatMode;
		}
				
		//console.log("imageCall, wireframe", imageCall, this.dim.wireframe);
		//var material = new THREE.MeshBasicMaterial({ 
		var material = new THREE.MeshPhongMaterial({ 
			map: THREE.ImageUtils.loadTexture(imageCall),
			side: THREE.DoubleSide/*,
			transparent: true*/
		});
		material.wireframe=this.dim.wireframe;
	
		return material;
	};
  
	ns.ThreeDMap.prototype.createMesh = function (geometry, material) {  
		return new THREE.Mesh(geometry, material);
	};

	ns.ThreeDMap.prototype.createControls = function () {
		var controls, centerX, centerY;
		controls = new THREE.TrackballControls(this.camera);

		return controls;
	};

	ns.ThreeDMap.prototype.render = function () {
		this.controls.update();  
		window.requestAnimationFrame(this.render.bind(this));
		this.renderer.render(this.scene, this.camera);
	};
	
	ns.ThreeDMap.prototype.resizeMe = function(){
    	window.clearTimeout(this.reloadTimer);
		this.reloadTimer=window.setTimeout(this.reloadAll.bind(this),1000);
		return;
	};
	
	ns.ThreeDMap.prototype.reloadAll = function(){
		this.dim.width = this.dim.div.clientWidth;
		this.dim.height = this.dim.div.clientHeight;
		//console.log(this.dim.width, this.dim.height);
		
		this.camera.aspect =  this.dim.width / this.dim.height;
		this.camera.updateProjectionMatrix();

		delete(this.controls);
		this.controls = this.createControls();
		this.renderer.setSize(this.dim.width, this.dim.height);
	};

}(wxs3));
