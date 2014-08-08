var wxs3 = wxs3 || {};

(function (ns) {
    'use strict';

    ns.WMTS=function(capabilitiesURL, epsg){
        this.tileMatrixSet={};
        this.epsg=epsg;
        this.capabilitiesURL=capabilitiesURL;
    };

    ns.WMTS.prototype.fetchCapabilities = function (callback){
        var client = new XMLHttpRequest();   
        var that = this;
        client.open('GET', this.capabilitiesURL);
        client.onreadystatechange = function() {
            if (this.readyState === 4) {
                var capabilitiesText=client.responseText;
                var capabilitiesXml=that.txt2xml(capabilitiesText);
                that.tileMatrixSet=that.parseCapabilities(capabilitiesXml);
                callback(that.tileMatrixSet);
            }
        };
        client.send();
    };

    ns.WMTS.prototype.parseCapabilities = function (capabilitiesXml) {
        var tileMatrixSet=[];
        // *magic* number for meters-based projections.
        // TODO: Figure out correct number for geographic projections
        var pixelsize=0.00028;
        // Hacky namespace-resolver to read default namespace. suggestions welcome
        var resolver = {
            lookupNamespaceURI: function lookup(aPrefix) {
                if (aPrefix == "default") {
                    return capabilitiesXml.documentElement.namespaceURI;
                }
                else if(aPrefix == 'ows') {
                    return 'http://www.opengis.net/ows/1.1';
                }
            }
        }

        // TODO: Find layers from capabilities and check if crs is supported by layer. Example xpath:
        //var iterator=capabilitiesXml.evaluate("//default:Capabilities/default:Contents/default:Layer[child::ows:Identifier[text()='topo2']]",capabilitiesXml, resolver,XPathResult.ANY_TYPE, null);

        // Find tilematrixset:
        var iterator=capabilitiesXml.evaluate(
            "//default:Capabilities/default:Contents/default:TileMatrixSet[child::ows:SupportedCRS[text()='urn:ogc:def:crs:EPSG::" + this.epsg + "']]/default:TileMatrix",
            capabilitiesXml, 
            resolver,
            XPathResult.ANY_TYPE, 
            null
            );
        try {
          var thisNode = iterator.iterateNext();
          while (thisNode) {
            // Populate tileMatrixSet
            tileMatrixSet.push({
                Identifier: thisNode.childNodes[3].textContent,
                ScaleDenominator: parseFloat(thisNode.childNodes[5].textContent),
                TopLeftCorner: { 
                    minx: parseFloat(thisNode.childNodes[7].textContent.split(' ')[0]),
                    maxy: parseFloat(thisNode.childNodes[7].textContent.split(' ')[1]),
                },
                TileWidth: parseInt(thisNode.childNodes[9].textContent),
                TileHeight: parseInt(thisNode.childNodes[11].textContent),
                MatrixWidth: parseInt(thisNode.childNodes[13].textContent),
                MatrixHeight: parseInt(thisNode.childNodes[15].textContent),
                // These are the two central numbers we need to calculate:
                // scaledenominator*pixelsize*tilewidth
                TileSpanX: parseFloat((thisNode.childNodes[5].textContent*pixelsize)*thisNode.childNodes[9].textContent),
                // scaledenominator*pixelsize*tileheight
                TileSpanY: parseFloat((thisNode.childNodes[5].textContent*pixelsize)*thisNode.childNodes[11].textContent),
                Zoom: parseInt(thisNode.childNodes[3].textContent.split(':').slice(-1)[0])
            });
            thisNode = iterator.iterateNext();
          } 
        }
        catch (e) {
          console.log( 'Error: An error occured during iteration ' + e );
        }
        return tileMatrixSet;
    }

    ns.WMTS.prototype.txt2xml = function (xmltxt) {
        if(window.DOMParser){
            // non i.e. browser
            var xmlparser = new DOMParser();
            var xmlDoc = xmlparser.parseFromString(xmltxt, "text/xml");
        }
        else{
            // i.e. browser 
            var xmlDoc = new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async = false;
            xmlDoc.loadXML(xmltxt);
        }
        return xmlDoc;
    };
}(wxs3));