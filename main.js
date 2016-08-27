'use strict';

// Extends console.log() and console.error():
function now() {
  function pad(str, width) {
    return ('0'.repeat(width) + str).slice(-width);
  }
  var now = new Date;
  return now.getHours() + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2) + '.'
    + pad(now.getMilliseconds(), 3);
}
console.log_orig = console.log;
console.log = function(str) {
  console.log_orig(now() + ' ' + str);
};
console.error_orig = console.error;
console.error = function(str) {
  console.error_orig(now() + ' ' + str);

  // Fail on error when testing:
  if (typeof fail != "undefined") { // fail() is provided by jasmine when testing
    fail(str);
  }
};

// Constants:
var statusLabelColor = 'success';
var statusLabelContent = '<i class="fa fa-spinner fa-spin fa-2x"></i>';

// Adds a listener on module readiness.
var addListener = function(listener) {
  listeners.push(listener);
};

var listeners = [];

var requireAngularApp = function(resolve, reject) {
  requirejs(['angular/app'], function(berlin) {
    console.log('Angular app imported.');

    // Replaces 'ng-app="berlin"', see
    // http://www.sitepoint.com/using-requirejs-angularjs-applications/ :
    angular.bootstrap(document, ['berlin']);

    berlin.status.set(statusLabelColor, statusLabelContent);

    window.dbg = berlin.dbg;
    resolve(berlin);
  });
};

var waitForAngularAppReady = function(berlinApp) {
  return new Promise(function(resolve, reject) {
    berlinApp.addListener(function() {
      resolve(berlinApp);
    });
  });
};

var initModals = function(resolve, reject) {
  $(document).ready(function() {
    $('.modal-page').removeClass('hidden');
    var modals = ['help', 'dbg_secret'];
    for (var i = 0; i < modals.length; ++i) {
      var modal = modals[i];
      $('.' + modal + '_open').animatedModal({
        modalTarget: modal,
        animatedIn: 'fadeIn',
        animatedOut: 'fadeOut',
        animationDuration: '.2s',
        color: '#f66', //FIXME: same as .brand-my
      });
    }
    console.log('Modals ready.');
    resolve();
  });
};

var clearStatusLabel = function(input) {
  var berlinApp = input[0];
  berlinApp.status.clear(statusLabelColor, statusLabelContent);
};

var callListeners = function() {
  console.log('App ready.');
  for (var i in listeners) {
    listeners[i]();
  }
};

var loadAngularApp = (new Promise(requireAngularApp)).then(waitForAngularAppReady);
Promise.all([loadAngularApp, new Promise(initModals)])
  .then(clearStatusLabel)
  .then(callListeners);

// Collapse navbar when clicking everywhere but on the filters:
$('body').on('click', null, null, function(e) {
  if ($(e.target).closest('.filter-control').length == 0) {
    $('#navbar').collapse('hide');
  }
});

define({
  addListener: addListener,
});
