'use strict';

window.module = {};
define(['thirdparty/timerlog-0.1.4/dist/index.es5', 'angular/app'], function(timerlog, app) {
  timerlog = module.exports;
  module = undefined;

  timerlog({
    id: 'init',
    start_timer: true,
    message: 'Initialization done.',
  });
  localStorage['timerlog'] = 1; // enables console logging
  console.log('Initializing app...');

  window.dbg = app.dbg;

  // Replaces 'ng-app="app"', see
  // http://www.sitepoint.com/using-requirejs-angularjs-applications/ :
  angular.bootstrap(document, ['app']);

  var statusLabelColor = 'success';
  var statusLabelContent = '<i class="fa fa-spinner fa-spin fa-2x"></i>';
  app.status.set(statusLabelColor, statusLabelContent);

  // Adds a listener on module readiness.
  var addListener = function(listener) {
    listeners.push(listener);
  };

  var listeners = [];

  var waitForAngularAppReady = function(resolve, reject) {
    app.addListener(function() {
      resolve();
    });
  };

  var initBars = function(resolve, reject) {
    $(document).ready(function() {
      // Collapse navbar when clicking everywhere but on the filters:
      $('body').on('click', null, null, function(e) {
        if ($(e.target).closest('.filter-control').length == 0) {
          $('#navbar').collapse('hide');
        }
      });

      // Collapse sidebar when clicking everywhere but on the markers or on some marker info
      // control:
      //FIXME: panning the map triggers 'click'
      var sidebarSelector = '.ui.sidebar';
      $('body').on('click', null, null, function(e) {
        if ($(e.target).closest('.gmnoprint').length == 0 &&
            $(e.target).closest('.info-control').length == 0) {
          $(sidebarSelector).sidebar('hide');
        }
      });

      var pushTransition = {
        left:   'push',
        bottom: 'push',
      };
      $(sidebarSelector)
        .sidebar('setting', 'dimPage', false)
        .sidebar('setting', 'closable', false)
        .sidebar('setting', 'defaultTransition', {
          computer: pushTransition,
          mobile:   pushTransition,
        });
      window.showSidebar = showSidebar;

      console.log('Bars ready.');
      resolve();

      function showSidebar() {
        // We actually have two sidebars and show the one or the other based on the screen size. The
        // one with `display: none` has been hidden by Bootstrap, so we want to show the other one.
        //FIXME: resizing the screen while a sidebar is open breaks the push transition.
        $(sidebarSelector).filter(function() {
          return $(this).css('display') != 'none';
        }).sidebar('show').sidebar('push page');
      }
    });
  };

  var initModals = function(resolve, reject) {
    $(document).ready(function() {
      $('.modal-page').removeClass('hidden');
      var modals = ['marker_list', 'dbg_secret'];
      for (var i = 0; i < modals.length; ++i) {
        var modal = modals[i];
        $('.' + modal + '_open').animatedModal({
          modalTarget: modal,
          animatedIn: 'fadeIn',
          animatedOut: 'fadeOut',
          animationDuration: '.2s',
          color: '#f66', //FIXME: same as .my
        });
      }
      console.log('Modals ready.');
      resolve();
    });
  };

  var clearStatusLabel = function() {
    app.status.clear(statusLabelColor, statusLabelContent);
  };

  var callListeners = function() {
    timerlog({
      id: 'init',
      end_timer: true,
    });
    console.log('[ready] App ready.');

    for (var i in listeners) {
      listeners[i]();
    }
  };

  Promise.all([new Promise(waitForAngularAppReady), new Promise(initBars), new Promise(initModals)])
    .then(clearStatusLabel)
    .then(callListeners)
    .catch(function(e) {
      if (e.sourceURL && e.line) {
        console.log('Error at ' + e.sourceURL + ':' + e.line);
      }
      console.error(e.stack ? e.stack : e);
    });

  return {
    addListener: addListener,
  };
});
