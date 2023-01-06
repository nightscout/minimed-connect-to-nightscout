/* jshint node: true */
"use strict";

var _ = require('lodash');

var logger = require('./logger');

var STALE_DATA_THRESHOLD_MINUTES = 20;
var SENSOR_GLUCOSE_ENTRY_TYPE = 'sgv';
var CARELINK_TREND_TO_NIGHTSCOUT_TREND = {
  'NONE': {
    'trend': 0,
    'direction': 'NONE'
  },
  'UP_TRIPLE': {
    'trend': 1,
    'direction': 'TripleUp'
  },
  'UP_DOUBLE': {
    'trend': 1,
    'direction': 'DoubleUp'
  },
  'UP': {
    'trend': 2,
    'direction': 'SingleUp'
  },
  'DOWN': {
    'trend': 6,
    'direction': 'SingleDown'
  },
  'DOWN_DOUBLE': {
    'trend': 7,
    'direction': 'DoubleDown'
  },
  'DOWN_TRIPLE': {
    'trend': 7,
    'direction': 'TripleDown'
  }
};

function parsePumpTime(pumpTimeString, offset, offsetMilliseconds, medicalDeviceFamily) {
  if (process.env['MMCONNECT_SERVER'] === 'EU' || medicalDeviceFamily === 'GUARDIAN') {
    return Date.parse(pumpTimeString) - offsetMilliseconds ; // FIX BY sirKitKat
  } else {
    return Date.parse(pumpTimeString + ' ' + offset);
  }
}

function timestampAsString(timestamp) {
  return new Date(timestamp).toISOString();
}

function deviceName(data) {
  return 'connect-' + data['medicalDeviceFamily'].toLowerCase();
}

var guessPumpOffset = (function () {
  var lastGuess;
  // From my observations, sMedicalDeviceTime is advanced by the server even when the app is
  // not reporting data or the pump is not connected, so its difference from server time is
  // always close to a whole number of hours, and can be used to guess the pump's timezone:
  // https://gist.github.com/mddub/f673570e6427c93784bf
  return function (data) {
    var pumpTimeAsIfUTC = Date.parse(data['sMedicalDeviceTime']);
    var serverTimeUTC = data['currentServerTime'];
    var hours = Math.round((pumpTimeAsIfUTC - serverTimeUTC) / (60 * 60 * 1000));
    var offset = (hours >= 0 ? '+' : '-') + (Math.abs(hours) < 10 ? '0' : '') + Math.abs(hours) + '00';
    if (offset !== lastGuess) {
      logger.log('Guessed pump timezone ' + offset + ' (pump time: "' + data['sMedicalDeviceTime'] + '"; server time: ' + new Date(data['currentServerTime']) + ')');
    }
    lastGuess = offset;
    return offset;
  };
})();

var guessPumpOffsetMilliseconds = (function () {
  return function (data) {
    var pumpTimeAsIfUTC = Date.parse(data['sMedicalDeviceTime']);
    var serverTimeUTC = data['currentServerTime'];
    var offsetMilliseconds = pumpTimeAsIfUTC - serverTimeUTC;
	var offsetMilliseconds = Math.round(offsetMilliseconds / (60 * 60 * 1000))*(60 * 60 * 1000)
	return offsetMilliseconds ;
  };
})();


function deviceStatusEntry(data, offset, offsetMilliseconds) {
  if (data['medicalDeviceFamily'] === 'GUARDIAN') {
    return {
      'created_at': timestampAsString(data['lastMedicalDeviceDataUpdateServerTime']),
      'device': deviceName(data),
      'uploader': {
        'battery': data['medicalDeviceBatteryLevelPercent'],
      },
      'connect': {
        'sensorState': data['sensorState'],
        'calibStatus': data['calibStatus'],
        'sensorDurationHours': data['sensorDurationHours'],
        'timeToNextCalibHours': data['timeToNextCalibHours'],
        'conduitInRange': data['conduitInRange'],
        'conduitMedicalDeviceInRange': data['conduitMedicalDeviceInRange'],
        'conduitSensorInRange': data['conduitSensorInRange'],
        'medicalDeviceBatteryLevelPercent': data['medicalDeviceBatteryLevelPercent'],
        'medicalDeviceFamily': data['medicalDeviceFamily']
      }
    };
  } else {
    return {
      'created_at': timestampAsString(data['lastMedicalDeviceDataUpdateServerTime']),
      'device': deviceName(data),
      'uploader': {
        'battery': data['conduitBatteryLevel'],
      },
      'pump': {
        'battery': {
          'percent': data['medicalDeviceBatteryLevelPercent'],
        },
        'reservoir': data['reservoirRemainingUnits'],
        'iob': {
          'timestamp': timestampAsString(data['lastMedicalDeviceDataUpdateServerTime']),
          'bolusiob': _.get(data, 'activeInsulin.amount') >= 0 ? _.get(data, 'activeInsulin.amount') : undefined,
        },
        'clock': timestampAsString(parsePumpTime(data['sMedicalDeviceTime'], offset, offsetMilliseconds, data['medicalDeviceFamily'])),
        // TODO: add last alarm from data['lastAlarm']['code'] and data['lastAlarm']['datetime']
        // https://gist.github.com/mddub/a95dc120d9d1414a433d#file-minimed-connect-codes-js-L79
      },
      'connect': {
        // For the values these can take, see:
        // https://gist.github.com/mddub/5e4a585508c93249eb51
        'sensorState': data['sensorState'],
        'calibStatus': data['calibStatus'],
        'sensorDurationHours': data['sensorDurationHours'],
        'timeToNextCalibHours': data['timeToNextCalibHours'],
        'conduitInRange': data['conduitInRange'],
        'conduitMedicalDeviceInRange': data['conduitMedicalDeviceInRange'],
        'conduitSensorInRange': data['conduitSensorInRange'],
      }
    };
  }
}

function sgvEntries(data, offset, offsetMilliseconds) {
  if (!data['sgs'] || !data['sgs'].length) {
    return [];
  }

  var sgvs = data['sgs'].filter(function (entry) {
    return entry['kind'] === 'SG' && entry['sg'] !== 0;
  }).map(function (sgv) {
    var timestamp = parsePumpTime(sgv['datetime'], offset, offsetMilliseconds, data['medicalDeviceFamily']);
    return {
      'type': SENSOR_GLUCOSE_ENTRY_TYPE,
      'sgv': sgv['sg'],
      'date': timestamp,
      'dateString': timestampAsString(timestamp),
      'device': deviceName(data),
    };
  });

  if (data['sgs'][data['sgs'].length - 1]['sg'] !== 0) {
    sgvs[sgvs.length - 1] = _.merge(
      sgvs[sgvs.length - 1],
      CARELINK_TREND_TO_NIGHTSCOUT_TREND[data['lastSGTrend']]
    );
  }

  return sgvs;
}

module.exports = function (data, sgvLimit) {
  var recency = (data['currentServerTime'] - data['lastMedicalDeviceDataUpdateServerTime']) / (60 * 1000);
  if (recency > STALE_DATA_THRESHOLD_MINUTES) {
    logger.log('Stale CareLink data: ' + recency.toFixed(2) + ' minutes old');
    return {
      devicestatus: [],
      entries: [],
    };
  }

  var offset = guessPumpOffset(data);
  var offsetMilliseconds = guessPumpOffsetMilliseconds(data);
  if (sgvLimit === undefined) {
    sgvLimit = Infinity;
  }
  return {
    // XXX: lower-case and singular for consistency with cgm-remote-monitor collection name
    devicestatus: [deviceStatusEntry(data, offset, offsetMilliseconds)],
    entries: _.takeRight(sgvEntries(data, offset, offsetMilliseconds), sgvLimit),
  };
};
