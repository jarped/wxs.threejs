var wxs3 = wxs3 || {};

(function (ns) {
  'use strict';

  ns.WMTS = function (capabilitiesURL, epsg) {
    this.tileMatrixSet = {};
    this.epsg = epsg;
    this.capabilitiesURL = capabilitiesURL;
  };

  ns.WMTS.prototype.fetchCapabilities = function (callback) {
    var client = new XMLHttpRequest();
    var that = this;
    client.open('GET', this.capabilitiesURL);
    client.onreadystatechange = function () {
      var capabilitiesXml, capabilitiesText;
      if (this.readyState === 4) {
        capabilitiesText = client.responseText;
        capabilitiesXml = that.txt2xml(capabilitiesText);
        that.tileMatrixSet = that.parseCapabilities(capabilitiesXml);
        callback(that.tileMatrixSet);
      }
    };
    client.send();
  };

  ns.WMTS.prototype.parseCapabilities = function (capabilitiesXml) {
    var thisNode;
    var tileMatrixSet = [];
    // *magic* number for meters-based projections.
    // TODO: Figure out correct number for geographic projections
    var pixelsize = 0.00028;
    // Hacky namespace-resolver to read default namespace. suggestions welcome
    var resolver = {
      lookupNamespaceURI: function lookup(aPrefix) {
        if (aPrefix == "default") {
          return capabilitiesXml.documentElement.namespaceURI;
        }
        else if (aPrefix == 'ows') {
          return 'http://www.opengis.net/ows/1.1';
        }
      }
    };

    // TODO: Find layers from capabilities and check if crs is supported by layer. Example xpath:
    //var iterator=capabilitiesXml.evaluate("//default:Capabilities/default:Contents/default:Layer[child::ows:Identifier[text()='topo2']]",capabilitiesXml, resolver,XPathResult.ANY_TYPE, null);

    // Find tilematrixset:
    var iterator = capabilitiesXml.evaluate(
        "//default:Capabilities/default:Contents/default:TileMatrixSet[child::ows:SupportedCRS[text()='urn:ogc:def:crs:EPSG::" + this.epsg + "']]/default:TileMatrix",
      capabilitiesXml,
      resolver,
      XPathResult.ANY_TYPE,
      null
    );
    try {
      thisNode = iterator.iterateNext();
      // Populate tileMatrixSet
      while (thisNode) {
        // Hack for firefox/chrome cross-compatibility
        var identifierTagName='Identifier';
        if (thisNode.getElementsByTagName(identifierTagName).length === 0)
            identifierTagName='ows:Identifier'
        tileMatrixSet.push({
          Identifier: thisNode.getElementsByTagName(identifierTagName)[0].textContent,
          ScaleDenominator: parseFloat(thisNode.getElementsByTagName('ScaleDenominator')[0].textContent),
          TopLeftCorner: {
            minx: parseFloat(thisNode.getElementsByTagName('TopLeftCorner')[0].textContent.split(' ')[0]),
            maxy: parseFloat(thisNode.getElementsByTagName('TopLeftCorner')[0].textContent.split(' ')[1])
          },
          TileWidth: parseInt(thisNode.getElementsByTagName('TileWidth')[0].textContent),
          TileHeight: parseInt(thisNode.getElementsByTagName('TileHeight')[0].textContent),
          MatrixWidth: parseInt(thisNode.getElementsByTagName('MatrixWidth')[0].textContent),
          MatrixHeight: parseInt(thisNode.getElementsByTagName('MatrixHeight')[0].textContent),
          // These are the two central numbers we need to calculate:
          // scaledenominator*pixelsize*tilewidth
          TileSpanX: parseFloat((thisNode.getElementsByTagName('ScaleDenominator')[0].textContent * pixelsize) * thisNode.getElementsByTagName('TileWidth')[0].textContent),
          // scaledenominator*pixelsize*tileheight
          TileSpanY: parseFloat((thisNode.getElementsByTagName('ScaleDenominator')[0].textContent * pixelsize) * thisNode.getElementsByTagName('TileHeight')[0].textContent),
          Zoom: parseInt(thisNode.getElementsByTagName(identifierTagName)[0].textContent.split(':').slice(-1)[0])
        });
        thisNode = iterator.iterateNext();
      }
    }
    catch (e) {
      console.log('Error: An error occured during iteration ' + e);
    }
    return tileMatrixSet;
  };

  ns.WMTS.prototype.txt2xml = function (xmltxt) {
    var xmlparser, xmlDoc;
    if (window.DOMParser) {
      // non i.e. browser
      xmlparser = new DOMParser();
      xmlDoc = xmlparser.parseFromString(xmltxt, "text/xml");
    }
    else {
      // i.e. browser
      xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
      xmlDoc.async = false;
      xmlDoc.loadXML(xmltxt);
    }
    return xmlDoc;
  };
}(wxs3));