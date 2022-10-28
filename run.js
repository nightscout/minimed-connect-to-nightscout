/* jshint node: true */
"use strict";
const { match } = require('assert');
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
  maxNightscoutDiff: 150
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

function getMatchingNightscoutSgv(minimedSgv,nightscoutSgvs) {
  var out = [];

  nightscoutSgvs.forEach(nightscoutSgv => {
    if(nightscoutSgv.sgv === minimedSgv.sgv) {
      var timeDiff = nightscoutSgv.date - minimedSgv.date;
      if(timeDiff >= 0 && timeDiff <= config.maxNightscoutDiff*1000) {
        out.push(nightscoutSgv);
      }
    }
  });

  return out;
}

function filterMissingSgvs(minimedSgvs,nightscoutSgvs) {
  var out = [];

  var matchCount = 0;
  var totalTimeDiff = 0;
  minimedSgvs.forEach(minimedSgv => {

    var matchingNightscoutSgvs = getMatchingNightscoutSgv(minimedSgv,nightscoutSgvs);
    if(matchingNightscoutSgvs.length === 0) {
      //console.warn(`> Adding ${minimedSgv.sgv} @ ${new Date(minimedSgv.date).toLocaleString()}`);
      out.push(minimedSgv);
    } else if (matchingNightscoutSgvs.length > 1) {
      console.error(`Something went wrong: More than 1 matching nightscout entry was returned for ${minimedSgv.sgv} @ ${new Date(minimedSgv.date).toLocaleString()}`);
      matchingNightscoutSgvs.forEach(matchingNightscoutSgv => {
        console.error(`\tNS match = ${matchingNightscoutSgv.sgv} @ ${new Date(matchingNightscoutSgv.date)}`)
      });
    } else {
      var matchingNightscoutSgv = matchingNightscoutSgvs[0];
      matchCount++;
      totalTimeDiff += matchingNightscoutSgv.date - minimedSgv.date;
    }
  });

  if(matchCount < 5) {
    console.log(`Not enough nightscout entries found, not uploading anything`);
    return [];
  }

  let averageTimeDiff = Math.round(totalTimeDiff/matchCount);
  console.log(`average time diff: ${averageTimeDiff}`);
  out.forEach(svg => {
    let dateBefore = svg.date;
    svg.date += averageTimeDiff;
    console.warn(`> Adding ${svg.sgv} @ ${new Date(dateBefore).toLocaleString()} =>${new Date(svg.date).toLocaleString()}`);
  });

  return out;
}

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
        fs.unlinkSync(path);
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

        var jsonData = JSON.stringify(data,undefined,4);
        deleteFileIfExists(dataPath);
        fs.writeFileSync(dataPath,jsonData);
        let transformed = transform(data, config.sgvLimit);
        
        // Because of Nightscout's upsert semantics and the fact that CareLink provides trend
        // data only for the most recent sgv, we need to filter out sgvs we've already sent.
        // Otherwise we'll overwrite existing sgv entries and remove their trend data.
        let newSgvs = filterSgvs(transformed.entries);

        nightscout.get(entriesUrl+'?find[device]=Leonneke%20%26lt%3B3&count='+(config.sgvLimit+5),function(err, response) {
          const nightscoutSgvs = response.body;

          let missingSgvs = filterMissingSgvs(newSgvs,nightscoutSgvs);

          // Nightscout's entries collection upserts based on date, but the devicestatus collection
          // does not do the same for created_at, so we need to de-dupe them here.
          let newDeviceStatuses = filterDeviceStatus(transformed.devicestatus);
          
          newDeviceStatuses[0].pump = {
            reservoir: data.reservoirRemainingUnits,
            status: {
              status: ' - Calibrate@' +new Date(new Date(newDeviceStatuses[0].created_at).valueOf()+data.timeToNextCalibrationMinutes*60*1000).toLocaleString()
            }
          }

          // Calculate interval by the device next upload time
          let interval = config.deviceInterval - (data.currentServerTime - data.lastMedicalDeviceDataUpdateServerTime);
          if (interval > config.deviceInterval || interval < 0)
            interval = config.deviceInterval;

          logger.log(`Next check ${Math.round(interval / 1000)}s later (at ${new Date(Date.now() + interval)})`)

          uploadMaybe(missingSgvs, entriesUrl, function() {
            uploadMaybe(newDeviceStatuses, devicestatusUrl, function() {
              setTimeout(requestLoop, interval);
            });
          });
        });
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
