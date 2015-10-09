/* jshint node: true */
"use strict";

var crypto = require('crypto'),
  request = require('request');

var config = require('./config'),
  logger = require('./logger');

module.exports = (function() {
  var PUMP_STATUS_ENTRY_TYPE = 'pump_status';
  var SENSOR_GLUCOSE_ENTRY_TYPE = 'sgv';

  function addTimeToEntry(pumpTimeString, entry) {
    var timeUTC = Date.parse(pumpTimeString + ' ' + config.PUMP_TIMEZONE);
    entry['date'] = timeUTC;
    entry['dateString'] = new Date(timeUTC).toISOString();
    return entry;
  }

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

    return addTimeToEntry(data['sMedicalDeviceTime'], entry);
  }

  function sgvEntries(data) {
    var out = [];

    if(data['sgs'] && data['sgs'].length) {
      var sgvs = data['sgs'].filter(function(entry) {
        return entry['kind'] === 'SG' && entry['sg'] !== 0;
      });
      // TODO: don't assume minimed will continue giving sensor glucose values ordered by date ascending
      for(var i = Math.max(0, sgvs.length - config.NUM_RECORDS_TO_SUBMIT); i < sgvs.length; i++) {
        var sgv = sgvs[i];
        out.push(
          addTimeToEntry(
            sgv['datetime'],
            {
              'type': SENSOR_GLUCOSE_ENTRY_TYPE,
              'sgv': sgv['sg'],
            }
          )
        );
      }
    }

    return out;
  }

  function transformForNightscout(data) {
    var entries = [];

    entries.push(pumpStatusEntry(data));

    sgvEntries(data).forEach(function(entry) {
      entries.push(entry);
    });

    entries.forEach(function(entry) {
      entry['device'] = 'MiniMed Connect ' + data['medicalDeviceFamily'] + ' ' + data['medicalDeviceSerialNumber'];
    });

    return entries;
  }

  function sendToNightscout(entries, callback) {
    var endpoint = config.NIGHTSCOUT_HOST + '/api/v1/entries.json';

    logger.log('POST ' + endpoint + ' ' + JSON.stringify(entries));
    request.post(
      endpoint,
      {
        body: entries,
        json: true,
        headers: {
          'api-secret': crypto.createHash('sha1').update(config.NIGHTSCOUT_API_SECRET).digest('hex')
        }
      },
      function(err, response) {
        if(err) {
          console.log("Error uploading to Nightscout: can't connect to Nightscout host");
          process.exit(1);
        } else if(response.statusCode !== 200) {
          console.log("Error uploading to Nightscout: " + JSON.stringify(response.body));
          process.exit(1);
        } else {
          callback(entries);
        }
      }
    );
  }

  function transformAndUpload(data, callback) {
    var entries = transformForNightscout(data);
    if(entries.length === 0) {
      logger.log('No valid data found in CareLink JSON: ' + JSON.stringify(data));
      return callback();
    } else {
      sendToNightscout(entries, callback);
    }
  }

  return {
    transformForNightscout: transformForNightscout,
    sendToNightscout: sendToNightscout,
    transformAndUpload: transformAndUpload
  };
})();
