/* jshint node: true */
"use strict";
const fs = require('fs');

var carelink = require('./carelink'),
  filter = require('./filter'),
  logger = require('./logger'),
  nightscout = require('./nightscout'),
  transform = require('./transform');

function readEnv(key, defaultVal) {
  var val = process.env[key] ||
    process.env[key.toLowerCase()] ||
    // Azure prefixes environment variables with this
    process.env['CUSTOMCONNSTR_' + key] ||
    process.env['CUSTOMCONNSTR_' + key.toLowerCase()];

  if (val === 'true') val = true;
  if (val === 'false') val = false;
  if (val === 'null') val = null;

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
  verbose: !readEnv('CARELINK_QUIET', true),
  deviceInterval: 5.1 * 60 * 1000,
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
var entriesUrl = (config.nsBaseUrl ? config.nsBaseUrl : 'https://' + config.nsHost) + '/api/v1/entries.json';
var devicestatusUrl = (config.nsBaseUrl ? config.nsBaseUrl : 'https://' + config.nsHost) + '/api/v1/devicestatus.json';

logger.setVerbose(config.verbose);

var filterSgvs = filter.makeRecencyFilter(function(item) {
  return item['date'];
});

var filterDeviceStatus = filter.makeRecencyFilter(function(item) {
  return new Date(item['created_at']).getTime();
});

function uploadMaybe(items, endpoint, callback) {
  if (items.length === 0) {
    logger.log('No new items for ' + endpoint);
    callback();
  } else {
    nightscout.upload(items, endpoint, config.nsSecret, function(err, response) {
      if (err) {
        // Continue gathering data from CareLink even if Nightscout can't be reached
        console.log(err);
      }
      callback();
    });
  }
}

function deleteFileIfExists(path) {
  fs.exists(path, function(exists) {
    if(exists) {
        console.log('File exists. Deleting now ...');
        fs.unlinkSync(path);
    } else {
        console.log('File not found, so not deleting.');
    }
  });
}

function requestLoop() {
  try {
    client.fetch(function(err, data) {
      if (err) {
        console.log(err);
        setTimeout(requestLoop, config.deviceInterval);
      } else {
        var dataPath = '/Users/asopleo/workspace/minimed-connect-to-nightscout/carelink-data.json';
        var transformedPath = '/Users/asopleo/workspace/minimed-connect-to-nightscout/carelink-transformed.json';

        var jsonData = JSON.stringify(data,undefined,4);
        deleteFileIfExists(dataPath);
        fs.writeFileSync(dataPath,jsonData);
        let transformed = transform(data, config.sgvLimit);
        var transformedData = JSON.stringify(transformed.devicestatus,undefined,4);
        deleteFileIfExists(transformedPath);
        fs.writeFileSync(transformedPath,transformedData);

        // Because of Nightscout's upsert semantics and the fact that CareLink provides trend
        // data only for the most recent sgv, we need to filter out sgvs we've already sent.
        // Otherwise we'll overwrite existing sgv entries and remove their trend data.
        let newSgvs = filterSgvs(transformed.entries);

        // Nightscout's entries collection upserts based on date, but the devicestatus collection
        // does not do the same for created_at, so we need to de-dupe them here.
        let newDeviceStatuses = filterDeviceStatus(transformed.devicestatus);

        // Calculate interval by the device next upload time
        let interval = config.deviceInterval - (data.currentServerTime - data.lastMedicalDeviceDataUpdateServerTime);
        if (interval > config.deviceInterval || interval < 0)
          interval = config.deviceInterval;

        logger.log(`Next check ${Math.round(interval / 1000)}s later (at ${new Date(Date.now() + interval)})`)

        //uploadMaybe(newSgvs, entriesUrl, function() {
          uploadMaybe(newDeviceStatuses, devicestatusUrl, function() {
            setTimeout(requestLoop, interval);
          });
        //});
      }
    });
  } catch (error) {
    console.error(error);
    setTimeout(requestLoop, config.deviceInterval);
  }
}

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

// Safety function to avoid ban for managed environments (it only happens once, on the start)
let waitTime = 0;
if (process.env.RANDOMIZE_INIT) { waitTime = getRandomInt(3 * 60 * 1000); }
console.log(`[MMConnect] Wait ${Math.round(waitTime / 1000)} seconds before start`);
setTimeout(requestLoop, waitTime);
