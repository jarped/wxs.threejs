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


wms.three-untiled - history:
============================

2014.11.12:

- The application reads one image (WMS or IMAGE) and no tiles.

- The IMAGE parameter is used for a static image or an image composed from multiple WMS calls before the application is called.

- WCS format: The application can be easily be configured using XYZ or geotiff parameter. Geotiff is less voluminous and is lot faster.

- The Model (canvas) adapts to its container when resized (responsive).

- The image size is preserved width parameters WIDTH and HEIGHT which preserve the initial image quality on large screens. These parameters are indirectly used to compute the dimensions of the height model. 

- The Vertical center of the height model is adjusted to (min + max) / 2. If the map covers an area of high altitudes (i.e. Galdhøpiggen) above sea level, a tipping of the model will cause the map to disappear over the screen top without this adjustment. On a computer you can move the model down width a right-click-drag, but not on a mobile device.

- Uses the consept of "pixels per vertex" to define the resolution of the height model in the image. Explicit configuration of height model dimensions (demWidth, demHeight) are not used. 

- When zooming into large scales, the computed resolution of the height model will be larger than the actual resolution. Adjustments to actual resolution are made to avoid stairs effect in the height model.

Todo:
- Hillshade

Sverre Iversen, Geolological survey of Norway