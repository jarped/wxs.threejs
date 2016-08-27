wxs.threejs-untiled
===================

2016.08.15:

- Upgraded to threejs 79
- All textures are loaded asynchronously.


2014.11.13:

- The application reads one image (WMS or IMAGE) with no tiles.

- The IMAGE parameter is used for a static image or an image composed from multiple WMS calls before the application is called.

- WCS format: The application can be easily be configured using XYZ or geotiff parameter. Geotiff is less voluminous and is a lot faster.

- The Model (canvas) adapts to its container when resized (responsive).

- The image size is preserved with parameters WIDTH and HEIGHT which preserve the initial image quality on large screens. These parameters are indirectly used to compute the dimensions of the height model. 

- The Vertical center of the height model is adjusted to (min + max) / 2. If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level, a tipping of the model will cause the map to disappear over the screen top without this adjustment. On a computer you can move the model down with a right-click-drag, but not on a mobile device.

- Uses the concept of "pixels per vertex" to define the resolution of the height model in the image. Explicit configuration of height model dimensions (demWidth, demHeight) are not used. 

- When zooming into large scales, the computed resolution of the height model will be larger than the actual resolution. Adjustment to actual resolution is made to avoid stairs effect in the height model.

Todo:
- Hillshade


wxs.threejs-profile
===================

2016.08.15:

- Upgraded to threejs 79
- Profiles (vertical meshes) are now working on mobile when textures are loaded asynchronously.


2014.11.25:

- As wxs.threejs-untiled and the possibility to place vertical profiles in the model.

- The code is prepared to handle a future data base for profiles:
	- a future url with parameter "bbox" and possibly additional parameters.
	- a future JSON response with profile metadata

- Transformation from source transformation system to destination transformation system and finally transformation to local grid model coordinates.

	A JSON response example used in the kode:

```sh
	profile = [//Bbox32: 528887,7005717,574049,7081214 
	{ 
		name: "Profile 0", 
			imgUrl: "img/trondheim_A_test_alpha_1.png", 
			CRS: "EPSG:32632", 
			xyStart: {x: 528887, y: 7081214}, 
			xyEnd: {x: 574049, y: 7005717}, 
			zEnd: -1406 
	}, 
	{ 
			name: "Profile 1", 
			imgUrl: "/website/webgl/img/trondheim_A_test_alpha_1.png", 
			CRS: "EPSG:32632", 
			xyStart: {x: 570000, y: 7070000}, 
			xyEnd: {x: 540000, y: 7010000}, 
			zStart: 900, 
			zEnd: -1406 
	}];
```


wxs.threejs
===========

*** WARNING ***
Major reworking of structure. 
Some old functionality is temporarily gone.

Realtime consumption of wxs-services


RawGit:

http://rawgit.com/jarped/wxs.threejs/master/example/frames.html


Additional information:

http://labs.kartverket.no/wcs-i-threejs/


Example-calls to the WCS:

http://labs.kartverket.no/wcs-i-quantum-gis/


The following licenses apply:

threejs: https://github.com/mrdoob/three.js/blob/master/LICENSE

tiff-js: https://github.com/GPHemsley/tiff-js/blob/master/LICENSE

openLayers: https://github.com/openlayers/openlayers/blob/master/license.txt


The solution uses web services from Kartverket which are subject to their own licenses (mostly CC-BY 3.0 Norway) and the Norwegian Geodata law. See http://kartverket.no/Kart/Kartverksted/Lisens/ for the license terms and http://kartverket.no/Kart/Kartverksted/ for details on the web services.
