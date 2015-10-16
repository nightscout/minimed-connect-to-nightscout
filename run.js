/* jshint node: true */
"use strict";

var carelink = require('./carelink'),
  logger = require('./logger'),
  nightscout = require('./nightscout'),
  transform = require('./transform');

function readEnv(key, defaultVal) {
  var val = process.env[key] ||
    process.env[key.toLowerCase()] ||
    // Azure prefixes environment variables with this
    process.env['CUSTOMCONNSTR_' + key] ||
    process.env['CUSTOMCONNSTR_' + key.toLowerCase()];
  return val !== undefined ? val : defaultVal;
}

var config = {
  username: readEnv('CARELINK_USERNAME'),
  password: readEnv('CARELINK_PASSWORD'),
  nsHost: readEnv('WEBSITE_HOSTNAME'),
  nsBaseUrl: readEnv('NS'),
  nsSecret: readEnv('API_SECRET'),
  interval: parseInt(readEnv('CARELINK_REQUEST_INTERVAL', 60 * 1000), 10),
  sgvLimit: parseInt(readEnv('CARELINK_SGV_LIMIT', 24), 10),
  maxRetryDuration: parseInt(readEnv('CARELINK_MAX_RETRY_DURATION', carelink.defaultMaxRetryDuration), 10),
  verbose: !!readEnv('CARELINK_VERBOSE')
};

if (!config.username) {
  throw new Error('Missing CareLink username');
} else if(!config.password) {
  throw new Error('Missing CareLink password');
}

var client = carelink.Client({
  username: config.username,
  password: config.password,
  maxRetryDuration: config.maxRetryDuration
});
var endpoint = (config.nsBaseUrl ? config.nsBaseUrl : 'https://' + config.nsHost) + '/api/v1/entries.json';

logger.setVerbose(config.verbose);

(function requestLoop() {
  client.fetch(function(err, data) {
    if (err) {
      throw new Error(err);
    } else {
      var entries = transform(data, config.sgvLimit);
      if (entries.length > 0) {
        nightscout.upload(entries, endpoint, config.nsSecret, function(err, response) {
          if (err) {
            // Continue gathering data from CareLink even if Nightscout can't be reached
            console.log(err);
          }
          setTimeout(requestLoop, config.interval);
        });
      } else {
        setTimeout(requestLoop, config.interval);
      }
    }
  });
})();
