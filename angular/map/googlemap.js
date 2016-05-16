'use strict';

var Map = (function() {
  // Creates a google map with no marker (yet).
  // elemId: already existing element id where to draw the google map.
  function Map(elemId) {

    // Adds a marker to the map. Will be hidden by default.
    // marker: instance of Marker.
    this.addMarker = function addMarker(marker) {
      markers.push(marker);
    };

    // Removes all markers.
    this.clearMarkers = function clearMarkers() {
      while (markers.length) {
        markers.pop().setVisibleOnMap(null);
      }
    }

    // Shows or hides the map's markers, depending whether they are matching the current filters
    // or not. Triggers label decluttering as a side effect.
    // areMatching: function that takes a list of tag keys and returns true if the provided tags
    //              match the current filters.
    this.showHideMarkers = function showHideMarkers(areMatching) {
      for (var i = 0; i < markers.length; ++i) {
        var marker = markers[i];
        marker.setVisibleOnMap(areMatching(marker.tagKeys) ? map : null);
      }
      deferredDeclutter();
    };

    // Adds a listener on instance readiness.
    // Listeners will get `elemId` as argument.
    this.addListener = function addListener(listener) {
      listeners.push(listener);
    };

    this.dbg_click_each_visible_marker = function dbg_click_each_visible_marker() {
      var nextDelay = 5000; // ms
      for (var i = 0; i < markers.length; ++i) {
        if (!markers[i].isVisible()) {
          continue;
        }

        (function(index) {
          setTimeout(function() {
            markers[index].dbg_clickListener();
          }, nextDelay);
        })(i);

        nextDelay += 2800;
      }
    };

    this.dbg_check_markers_are_visible = function dbg_check_markers_are_visible() {
      for (var i = 0; i < markers.length; ++i) {
        if (markers[i].isVisible()) {
          return;
        }
      }
      error('No marker visible.');
    };

    // Shows/Hides marker labels.
    function declutter() {
      if (that.dbg_no_declutter) {
        return;
      }

      // Optimization: if we zoomed out a lot, keep all labels hidden.
      if (map.getZoom() < 12) {
        return;
      }

      var projection = projectionFactory.getProjection();
      if (!projection) {
        return; // initialization isn't done yet
      }

      for (var i = 0; i < markers.length; ++i) {
        var marker = markers[i];
        marker.declutterDone = false;
        marker.positionPoint
          = marker.isVisible() ? projection.fromLatLngToContainerPixel(marker.getPosition()) : null;
      }

      var tolerance = 20; // px

      // Note that by iterating in that direction, latest markers have more chance to get a
      // visible label:
      outer:
      for (var i = 0; i < markers.length; ++i) {
        var markerBeingEvaluated = markers[i];
        if (!markerBeingEvaluated.isVisible()) {
          continue;
        }

        for (var j = 0; j < markers.length; ++j) {
          var markerNotToHide = markers[j];
          if (markerBeingEvaluated === markerNotToHide ||
              !markerNotToHide.isVisible() ||
              markerNotToHide.declutterDone && !markerNotToHide.isLabelVisible()) {
            continue;
          }

          var dX = markerNotToHide.positionPoint.x - markerBeingEvaluated.positionPoint.x;
          var dY = markerNotToHide.positionPoint.y - markerBeingEvaluated.positionPoint.y;
          if (Math.abs(dX) < tolerance &&
              Math.abs(dY) < tolerance) {
            markerBeingEvaluated.setLabelVisible(false);
            markerBeingEvaluated.declutterDone = true;
            continue outer;
          }
        }

        markerBeingEvaluated.setLabelVisible(true);
        markerBeingEvaluated.declutterDone = true;
      }
    };

    // Calls declutter() in a bit.
    var deferredDeclutter = (function() {
      var timeout = null;
      return function deferredDeclutter() {
        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(declutter, 2000);
      };
    })();

    // Private members:
    var that = this;
    var map = new google.maps.Map(document.getElementById(elemId), {
      center: berlinTvTower,
      zoom: defaultZoomLevel,
      mapTypeControl: false,
      streetViewControl: false,
    });
    map.addListener('zoom_changed', (function() {
      var prevZoomLevel = defaultZoomLevel;
      return function() {
        var zoomLevel = map.getZoom();
        if (zoomLevel == prevZoomLevel) {
          error("zoom_changed triggered although zoom level hasn't changed.");
          return; // nothing to do
        }
        if (zoomLevel < prevZoomLevel) { // zoomed out
          // We hide all labels immediately in order to avoid a bug on Safari on iPhone 4S where too
          // many visible labels make the browser crash. The deferred decluttering will kick in soon
          // to show again a reasonable amount of labels.
          for (var i = 0; i < markers.length; ++i) {
            var marker = markers[i];
            if (marker.isVisible()) {
              marker.setLabelVisible(false);
            }
          }
        }
        prevZoomLevel = zoomLevel;
        deferredDeclutter();
      };
    })());
    map.addListener('tilesloaded', (function() {
      var firstTime = true;
      return function() {
        if (firstTime) {
          console.log(elemId + ' ready.');
          for (var i in listeners) {
            listeners[i](elemId);
          }
        }
        firstTime = false;
      };
    })());

    var projectionFactory = new google.maps.OverlayView();
    projectionFactory.draw = function draw(){};
    projectionFactory.onAdd = deferredDeclutter;
    projectionFactory.setMap(map);

    var listeners = []; // listeners on map readiness.
    var markers = [];

    // Public members:
    this.gPlaces = new google.maps.places.PlacesService(map);
    this.dbg_no_declutter = false;
  };

  // Private constants:
  var berlinTvTower = {
    lat: 52.520815,
    lng: 13.409419,
  };
  var defaultZoomLevel = 12;

  return Map;
})();

var Marker = (function() {
  // Creates a map marker.
  // descriptor: descriptor for this marker, following markerDescriptors' layout.
  // gPlaces: instance of google.maps.places.PlacesService .
  // getTagDescriptorByKey: a function taking a tag key as argument and returning the
  //                        corresponding tag descriptor.
  // filtersId: filter panel's id.
  function Marker(descriptor, getTagDescriptorByKey, gPlaces, filtersId) {

    // Shows or hides the marker.
    // map: instance of google.maps.Map or null.
    this.setVisibleOnMap = function setVisibleOnMap(map) {
      if (!map) { // hiding
        // Looks like info windows of hidden markers can't get closed, so we don't take the risk:
        closeAnyOpenInfoWindow();
      }

      var justCreated = false;
      if (!googleMarker && map) {
        googleMarker = createGoogleMarker();
        justCreated = true;
      }
      if (googleMarker && googleMarker.map != map) {
        googleMarker.setMap(map);
      }
      if (justCreated) {
        // Hide label by default on new markers. The decluttering will make it visible eventually.
        this.setLabelVisible(false);
      }
      if (!map) {
        // Let it be garbage collected:
        googleMarker = null;
      }
    }

    this.isVisible = function isVisible() {
      return !!googleMarker && !!googleMarker.map;
    };

    // Shows or hides the marker label.
    // visibility: boolean.
    this.setLabelVisible = function setLabelVisible(visibility) {
      if (this.isVisible()) {
        // set() triggers a refresh, while just setting the property doesn't, see MarkerWithLabel's
        // implementation:
        googleMarker.set('labelVisible', visibility);
      } else {
        error("setLabelVisible(" + visibility + "): marker '" + descriptor.title +
              "' isn't visible, ignored.");
      }
    }

    this.isLabelVisible = function isLabelVisible() {
      return this.isVisible() && googleMarker.labelVisible;
    }

    this.getPosition = function getPosition() {
      if (this.isVisible()) {
        return googleMarker.getPosition();
      } else {
        error("getPosition(): not implemented for invisible markers yet.");
      }
    }

    // Private methods

    // Returns the distance in meters between this marker and the provided position.
    function distanceFrom(position) {
      // See https://en.wikipedia.org/wiki/Haversine_formula

      var earthRadius = 6371000;

      var lat1 = descriptor.position.lat * Math.PI / 180;
      var lng1 = descriptor.position.lng * Math.PI / 180;
      var lat2 = position.lat * Math.PI / 180;
      var lng2 = position.lng * Math.PI / 180;

      var sinMeanLat = Math.sin((lat2 - lat1) / 2);
      var sinMeanLng = Math.sin((lng2 - lng1) / 2);

      var result = 2 * earthRadius * Math.asin(Math.sqrt(
        sinMeanLat * sinMeanLat + Math.cos(lng1) * Math.cos(lng2) * sinMeanLng * sinMeanLng));
      return result;
    }

    // MarkerWithLabel factory.
    function createGoogleMarker() {
      var gMarkerOpts = {};
      gMarkerOpts.position = descriptor.position;
      gMarkerOpts.labelContent = descriptor.title;
      gMarkerOpts.labelAnchor = new google.maps.Point(-5,  // 5px to the right
                                                      -5); // 5px to the bottom
      gMarkerOpts.labelClass = 'map-label';
      gMarkerOpts.icon = googleIcon(that.tagKeys, getTagDescriptorByKey);

      var result = new MarkerWithLabel(gMarkerOpts);
      result.addListener('click', clickListener);
      return result;
    };

    // Private members:
    var that = this;
    var googleMarker = null;
    var clickListener = (function() {

      var IGNORE_ERRORS = "ignore";

      function openInfoWindow(gPlace, status) {
        closeAnyOpenInfoWindow();

        var infoContent = '<div><span class="infowindow-title">' + descriptor.title + '</span>';
        if (descriptor.comment) {
          infoContent += '<span class="infowindow-comment"> // ' + descriptor.comment + '</span>';
        }
        infoContent += '</div>';

        if (status != google.maps.places.PlacesServiceStatus.OK || !gPlace) {
          if (status == google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
            error("API rate limit hit.");
          } else if (status != IGNORE_ERRORS) {
            error('Place "' + descriptor.title + '"\'s details not found.');
          }
        } else {
          var location = gPlace.geometry.location;
          checkDistance({
            lat: location.lat(),
            lng: location.lng(),
          });

          if (gPlace.permanently_closed) {
            infoContent += '<div class="infowindow-closed">Permanently closed.</div>';
          } else if (gPlace.opening_hours) {
            if (gPlace.opening_hours.open_now) {
              infoContent += '<div class="infowindow-open">Open now.</div>';
            } else {
              infoContent += '<div class="infowindow-closed">Closed now.</div>';
            }
          }
          if (gPlace.website) {
            infoContent += '<a class="infowindow-website" target="_blank" href="'
              + gPlace.website + '">' + gPlace.website + '</a>';
          }
          if (gPlace.formatted_address) {
            infoContent += '<div class="infowindow-address">' + gPlace.formatted_address
              + '</div>';
          }
        }

        for (var i = 0; i < that.tagKeys.length; ++i) {
          infoContent += '<a class="infowindow-tag" href="javascript: $(\'#' + filtersId
            + '\').popup(\'show\');">#' + that.tagKeys[i] + '</a> ';
        }

        var infoWindow = new google.maps.InfoWindow({
          content: infoContent,
        });
        infoWindow.open(googleMarker.map, googleMarker);
        currentlyOpenInfoWindow = infoWindow;
      }

      var listener = function listener() {
        gPlaces.nearbySearch({
          location: descriptor.position,
          radius: tolerance,
          keyword: descriptor.title,
        }, function(results, status) {
          var googlePlaceId;
          if (status != google.maps.places.PlacesServiceStatus.OK || !results.length) {
            if (status == google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
              error("API rate limit hit.");
            }
            if (!descriptor.place_id) {
              if (!descriptor.ignore_errors) {
                error('Place "' + descriptor.title + '" not found.');
              }
            } else {
              // Gotten from
              // https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder :
              googlePlaceId = descriptor.place_id; // fallback to hard-coded place ID if not found
            }
          } else {
            if (results.length > 1 && !descriptor.place_id) {
              error('Place "' + descriptor.title + '" found ' + results.length + ' times:');
              for (var i in results) {
                console.log(results[i]);
              }
            }
            if (descriptor.place_id) {
              if (!descriptor.ignore_errors && descriptor.place_id != results[0].place_id) {
                error('Place "' + descriptor.title + '" has id ' + results[0].place_id);
              }
              googlePlaceId = descriptor.place_id;
            } else {
              googlePlaceId = results[0].place_id;
            }

            var location = results[0].geometry.location;
            checkDistance({
              lat: location.lat(),
              lng: location.lng(),
            });
          }

          if (googlePlaceId) {
            // console.log(descriptor.title + ' has id ' + googlePlaceId);
            gPlaces.getDetails({
              placeId: googlePlaceId,
            }, openInfoWindow);
          } else {
            openInfoWindow(null, descriptor.ignore_errors ? IGNORE_ERRORS : null);
          }
        });
      };

      function checkDistance(receivedPosition) {
        var distance = distanceFrom(receivedPosition);
        if (distance > tolerance) {
          error('Place "' + descriptor.title + '" is ' + distance + 'm away, at ('
                + receivedPosition.lat + ', ' + receivedPosition.lng + ').');
        }
      }

      return listener;
    })();

    // Public members:
    this.tagKeys = descriptor.tags;
    this.dbg_clickListener = clickListener;
    this.dbg_descriptor = descriptor;
  };

  // Returns the best possible icon object to be inserted in the google marker options, based on
  // its provided tags and an heuristic.
  // getTagDescriptorByKey: a function taking a tag key as argument and returning the
  //                        corresponding tag descriptor.
  function googleIcon(tagKeys, getTagDescriptorByKey) {
    // The idea of this heuristic is that the first tag describes the marker better than the
    // last one.

    // Iterate from the least to the most important tag:
    var url = null;
    var color = 'gray';
    for (var key = tagKeys.length - 1; key >= 0; --key) {
      var descriptor = getTagDescriptorByKey(tagKeys[key]);
      // If the descriptor has an icon, overtake it:
      if (descriptor.icon) {
        url = descriptor.icon;
      }
      // If the descriptor has a color, overtake it:
      if (descriptor.color) {
        color = descriptor.color;
      }
    }

    if (!url) {
      return null;
    }
    return {
      url: url + '_' + color + '.png',
      anchor: new google.maps.Point(7, 7), // px
    };
  };

  function closeAnyOpenInfoWindow() {
    if (currentlyOpenInfoWindow) {
      currentlyOpenInfoWindow.close();
      currentlyOpenInfoWindow = null;
    }
  }

  // Private static members:
  var tolerance = 80; // meters
  var currentlyOpenInfoWindow;

  return Marker;
})();

define({
  Map: Map,
  Marker: Marker,

  // File containing all the marker descriptors:
  markerDescriptors: requirejs.toUrl('angular/map/markers.json'),
});
