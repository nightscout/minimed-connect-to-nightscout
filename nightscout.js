/* jshint node: true */
"use strict";

var crypto = require('crypto'),
  request = require('request');

var logger = require('./logger');

var PUMP_STATUS_ENTRY_TYPE = 'pump_status';
var SENSOR_GLUCOSE_ENTRY_TYPE = 'sgv';

function addTimeToEntry(pumpTimeString, offset, entry) {
  var timeUTC = Date.parse(pumpTimeString + ' ' + offset);
  entry['date'] = timeUTC;
  entry['dateString'] = new Date(timeUTC).toISOString();
  return entry;
}

function pumpStatusEntry(data, offset) {
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

  return addTimeToEntry(data['sMedicalDeviceTime'], offset, entry);
}

function sgvEntries(data, offset) {
  if(data['sgs'] && data['sgs'].length) {
    return data['sgs'].filter(function(entry) {
      return entry['kind'] === 'SG' && entry['sg'] !== 0;
    }).map(function(sgv) {
      return addTimeToEntry(
        sgv['datetime'],
        offset,
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

var transform = module.exports.transform = function(data, offset, sgvLimit) {
  if(sgvLimit === undefined) {
    sgvLimit = Infinity;
  }

  var entries = [];

  entries.push(pumpStatusEntry(data, offset));

  var sgvs = sgvEntries(data, offset);
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
