var config = require('./config'),
  fetch = require('./fetch'),
  nightscout = require('./nightscout');

(function requestLoop() {
  fetch(function(data) {
    nightscout.transformAndUpload(data, function(entries) {
      setTimeout(requestLoop, config.CARELINK_REQUEST_INTERVAL);
    });
  });
})();
