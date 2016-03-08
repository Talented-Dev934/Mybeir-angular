'use strict';

(function(){
  var app = angular.module('tags', []);

  app.factory('tagsModuleIsReady', function() {
    return function() {
      return !!app.tagFilters;
    };
  });

  // Service for knowing whether a marker with the provided set of tags is to be displayed or not,
  // based on the current checkbox states.
  app.factory('areMatching', function() {
    return function(tagKeys) {
      checkModuleIsReady();
      return app.tagFilters.areMatching(tagKeys);
    };
  });

  // Service for getting a tag descriptor by key.
  app.factory('getTagDescriptorByKey', function() {
    return function(key) {
      checkModuleIsReady();
      return app.tagFilters.getDescriptorByKey(key);
    };
  });

  // Service for adding a listener on filter changes.
  app.factory('addListener', function() {
    return function(listener) {
      checkModuleIsReady();
      app.tagFilters.addListener(listener);
    };
  });

  app.filter('rawHtml', ['$sce', function($sce) {
    return function(val) {
      return $sce.trustAsHtml(val);
    }
  }]);

  app.directive('tagFilters', ['$timeout', function($timeout) {
    return {
      restrict: 'E',
      templateUrl: 'angular/tags/tag-filters.html',
      controller: function($http, $scope) {
        $scope.states = {};

        var controller = this;
        controller.groups = [];
        var tagDescriptors = 'angular/tags/tags.json';
        $http.get(tagDescriptors).success(function(data) {
          controller.groups = data;
          if (!app.tagFilters) {
            app.tagFilters = new TagFilters(data, $scope.states);
          }
        });
      },
      controllerAs: 'tags',
      link: function(scope, elm, attrs, ctrl) {
        var deregisterWatch = scope.$watch(function allCheckboxesAreInDom() {
          return app.tagFilters
            ? app.tagFilters.numberOfKeys == elm.find('.checkbox').length : false;
        }, function(allCheckboxesAreInDom) {
          if (allCheckboxesAreInDom) {
            deregisterWatch();

            // Note that without 'onChange', a Semantic UI checkbox can't be toggled.
            var checkboxes = elm.find('.checkbox');
            if (!checkboxes.length) {
              console.error('No checkboxes found.');
            }
            checkboxes.checkbox({
              onChange: function() {
                // Workaround for https://github.com/Semantic-Org/Semantic-UI/issues/1202 :
                var inputElm = $(this);
                scope.$apply(scope.states[inputElm.attr('name')] = inputElm.is(':checked'));

                $timeout(function () { // necessary on Safari and Android's browser, so Angular
                                       // first updates the model
                  app.tagFilters.callListeners();
                });
              },
            });
          }
        });
      },
    };
  }]);

  var checkModuleIsReady = function() {
    if (!app.tagFilters) {
      console.error("tags module isn't ready.");
    }
  }

  var TagFilters = (function() {
    // tagDescriptors: tag descriptors organized in groups, as in tagDescriptors.
    // states: empty object. A boolean property for each tag will be created, serving as 2-way bound
    //         model.
    var TagFilters = function(tagDescriptors, states) {

      // Returns true if the provided set of tags matches the current filters.
      this.areMatching = function(tagKeys) {
        // There is a match if at least one selected tag of each group is in the provided keys. In
        // other words, criteria within the same group are linked with an OR, whereas groups are
        // linked with an AND.

        for (var i = 0; i < descriptors.length; ++i) {
          var group = descriptors[i];
          var oneSelectedTagFoundInProvidedSet = false;
          for (var j = 0; j < group.length; ++j) {
            var key = group[j].name;
            if ($.inArray(key, tagKeys) >= 0 && currentStates[key]) {
              oneSelectedTagFoundInProvidedSet = true;
              break;
            }
          }
          if (!oneSelectedTagFoundInProvidedSet) {
            return false;
          }
        }
        return true;
      };

      this.getDescriptorByKey = function(key) {
        for (var i = 0; i < descriptors.length; ++i) {
          var group = descriptors[i];
          for (var j = 0; j < group.length; ++j) {
            var descriptor = group[j];
            if (descriptor.name == key) {
              return descriptor;
            }
          }
        }
      };

      this.addListener = function(listener) {
        listeners.push(listener);
      }

      this.callListeners = function() {
        for (var i in listeners) {
          listeners[i]();
        }
      }

      this.numberOfKeys = 0;

      // Private members:
      var descriptors = tagDescriptors;
      var listeners = [];
      var currentStates = states;

      // Initialize states:
      for (var i = 0; i < descriptors.length; ++i) {
        var group = descriptors[i];
        for (var j = 0; j < group.length; ++j) {
          var tag = group[j];
          states[tag.name] = tag.initialState;
          ++this.numberOfKeys;
        }
      }
    };

    return TagFilters;
  })();
})();
