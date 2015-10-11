/* jshint node: true */
"use strict";

var crypto = require('crypto'),
  request = require('request');

var logger = require('./logger');

var STALE_DATA_THRESHOLD_MINUTES = 20;
var PUMP_STATUS_ENTRY_TYPE = 'pump_status';
var SENSOR_GLUCOSE_ENTRY_TYPE = 'sgv';

function parsePumpTime(pumpTimeString, offset) {
  return Date.parse(pumpTimeString + ' ' + offset);
}

function addTimeToEntry(utc, entry) {
  entry['date'] = utc;
  entry['dateString'] = new Date(utc).toISOString();
  return entry;
}

var guessPumpTimezone = (function() {
  var lastGuess;

  // From my observations, sMedicalDeviceTime is advanced by the server even when the app is
  // not reporting data or the pump is not connected, so its difference from server time is
  // always close to a whole number of hours, and can be used to guess the pump's timezone:
  // https://gist.github.com/mddub/f673570e6427c93784bf
  return function guessPumpTimezone(data) {
    var timezoneNaivePumpTime = Date.parse(data['sMedicalDeviceTime'] + ' +0');
    var serverTimeUTC = data['currentServerTime'];
    var hours = Math.round((timezoneNaivePumpTime - serverTimeUTC) / (60*60*1000));
    var offset = (hours >= 0 ? '+' : '-') + (Math.abs(hours) < 10 ? '0' : '') + Math.abs(hours) + '00';
    if (offset !== lastGuess) {
      logger.log('Guessed pump timezone ' + offset + ' (pump time: "' + data['sMedicalDeviceTime'] + '"; server time: ' + new Date(data['currentServerTime']) + ')');
    }
    lastGuess = offset;
    return offset;
  };
})();

function pumpStatusEntry(data) {
  var entry = {'type': PUMP_STATUS_ENTRY_TYPE};

  [
    'conduitBatteryLevel',
    'conduitInRange',
    'conduitMedicalDeviceInRange',
    'reservoirLevelPercent',
    'reservoirAmount',
    'medicalDeviceBatteryLevelPercent'
  ].forEach(function(key) {
    if(data[key] !== undefined) {
      entry[key] = data[key];
    }
  });

  if(data['activeInsulin'] && data['activeInsulin']['amount'] >= 0) {
    entry['activeInsulin'] = data['activeInsulin']['amount'];
  }

  return addTimeToEntry(data['lastMedicalDeviceDataUpdateServerTime'], entry);
}

function sgvEntries(data) {
  var offset = guessPumpTimezone(data);

  if(data['sgs'] && data['sgs'].length) {
    return data['sgs'].filter(function(entry) {
      return entry['kind'] === 'SG' && entry['sg'] !== 0;
    }).map(function(sgv) {
      return addTimeToEntry(
        parsePumpTime(sgv['datetime'], offset),
        {
          'type': SENSOR_GLUCOSE_ENTRY_TYPE,
          'sgv': sgv['sg'],
        }
      );
    });
  } else {
    return [];
  }
}

var transform = module.exports.transform = function(data, sgvLimit) {
  var recency = (data['currentServerTime'] - data['lastMedicalDeviceDataUpdateServerTime']) / (60 * 1000);
  if (recency > STALE_DATA_THRESHOLD_MINUTES) {
    logger.log('Stale CareLink data: ' + recency.toFixed(2) + ' minutes old');
    return [];
  }

  if (sgvLimit === undefined) {
    sgvLimit = Infinity;
  }

  var entries = [];

  entries.push(pumpStatusEntry(data));

  var sgvs = sgvEntries(data);
  // TODO: this assumes sgvs are ordered by date ascending
  for(var i = Math.max(0, sgvs.length - sgvLimit); i < sgvs.length; i++) {
    entries.push(sgvs[i]);
  }

  entries.forEach(function(entry) {
    entry['device'] = 'MiniMed Connect ' + data['medicalDeviceFamily'] + ' ' + data['medicalDeviceSerialNumber'];
  });

  return entries;
};

var upload = module.exports.upload = function(entries, endpoint, secret, callback) {
  logger.log('POST ' + endpoint + ' ' + JSON.stringify(entries));
  request.post(
    endpoint,
    {
      body: entries,
      json: true,
      headers: {
        'api-secret': crypto.createHash('sha1').update(secret).digest('hex')
      }
    },
    function(err, response) {
      if(err) {
        throw new Error("Error uploading to Nightscout: can't connect to Nightscout host");
      } else if(response.statusCode !== 200) {
        throw new Error("Error uploading to Nightscout: " + JSON.stringify(response));
      } else {
        callback(response);
      }
    }
  );
};
