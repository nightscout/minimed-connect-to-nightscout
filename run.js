/* jshint node: true */
"use strict";

var config = require('./config'),
  carelink = require('./carelink'),
  nightscout = require('./nightscout');

var client = carelink.Client({username: config.CARELINK_USERNAME, password: config.CARELINK_PASSWORD}),
  endpoint = config.NIGHTSCOUT_HOST + '/api/v1/entries.json',
  secret = config.NIGHTSCOUT_API_SECRET;

(function requestLoop() {
  client.fetch(function(data) {
    var entries = nightscout.transform(data, config.PUMP_TIMEZONE, config.NUM_RECORDS_TO_SUBMIT);
    nightscout.upload(entries, endpoint, secret, function(response) {
      setTimeout(requestLoop, config.CARELINK_REQUEST_INTERVAL);
    });
  });
})();
