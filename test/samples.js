// These are samples of real CareLink data, except that
// 'sgs' has been trimmed from 288 to 6 records

module.exports.missingLastSgv = {
  "bgUnits" : "MGDL",
  "bgunits" : "MGDL",
  "calibStatus" : "LESS_THAN_TWELVE_HRS",
  "conduitBatteryLevel" : 29,
  "conduitBatteryStatus" : "MEDIUM",
  "conduitInRange" : true,
  "conduitMedicalDeviceInRange" : true,
  "conduitSensorInRange" : true,
  "conduitSerialNumber" : "0",
  "currentServerTime" : 1445268224137,
  "firstName" : "<redacted>",
  "kind" : "Main",
  "lastConduitTime" : 0,
  "lastConduitUpdateServerTime" : 1445267870381,
  "lastMedicalDeviceDataUpdateServerTime" : 1445267870381,
  "lastName" : "<redacted>",
  "lastSGTrend" : "NONE",
  "lastSensorTS" : 0,
  "lastSensorTSAsString" : "Oct 19, 2015 08:20:00",
  "lastSensorTime" : 0,
  "medicalDeviceBatteryLevelPercent" : 75,
  "medicalDeviceFamily" : "PARADIGM",
  "medicalDeviceSerialNumber" : "<redacted>",
  "medicalDeviceSuspended" : false,
  "medicalDeviceTime" : 0,
  "medicalDeviceTimeAsString" : "Oct 19, 2015 08:20:00",
  "reservoirAmount" : 60,
  "reservoirLevelPercent" : 25,
  "sLastSensorTime" : "Oct 19, 2015 08:20:00",
  "sMedicalDeviceTime" : "Oct 19, 2015 08:20:00",
  "sensorDurationHours" : 73,
  "sensorState" : "NORMAL",
  "timeFormat" : "HR_12",
  "timeToNextCalibHours" : 10,
  "version" : 1,
  "activeInsulin" : {
    "version" : 1,
    "amount" : 4.85,
    "kind" : "Insulin",
    "datetime" : "Oct 19, 2015 08:16:32"
  },
  "lastAlarm" : {
    "version" : 1,
    "kind" : "Alarm",
    "code" : 102,
    "type" : "ALARM",
    "datetime" : "Oct 19, 2015 07:59:18",
    "flash" : false
  },
  "lastSG" : {
    "version" : 1,
    "kind" : "SG",
    "sg" : 66,
    "timeChange" : false,
    "datetime" : "Oct 19, 2015 08:15:00"
  },
  "limits" : [
    {
      "index" : 0,
      "version" : 1,
      "lowLimit" : 70,
      "highLimit" : 180,
      "kind" : "Limits"
    },
    {
      "lowLimit" : 70,
      "version" : 1,
      "highLimit" : 200,
      "kind" : "Limits",
      "index" : 67
    },
    {
      "index" : 187,
      "version" : 1,
      "lowLimit" : 70,
      "highLimit" : 200,
      "kind" : "Limits"
    },
    {
      "index" : 253,
      "lowLimit" : 70,
      "version" : 1,
      "highLimit" : 180,
      "kind" : "Limits"
    },
    {
      "highLimit" : 0,
      "kind" : "Limits",
      "version" : 1,
      "lowLimit" : 0,
      "index" : 287
    }
  ],
  "sgs" : [
    {
      "timeChange" : false,
      "sg" : 70,
      "kind" : "SG",
      "version" : 1,
      "datetime" : "Oct 19, 2015 07:55:00"
    },
    {
      "version" : 1,
      "sg" : 69,
      "timeChange" : false,
      "kind" : "SG",
      "datetime" : "Oct 19, 2015 08:00:00"
    },
    {
      "datetime" : "Oct 19, 2015 08:05:00",
      "version" : 1,
      "sg" : 68,
      "timeChange" : false,
      "kind" : "SG"
    },
    {
      "version" : 1,
      "timeChange" : false,
      "sg" : 65,
      "kind" : "SG",
      "datetime" : "Oct 19, 2015 08:10:00"
    },
    {
      "datetime" : "Oct 19, 2015 08:15:00",
      "version" : 1,
      "kind" : "SG",
      "sg" : 66,
      "timeChange" : false
    },
    {
      "kind" : "SG",
      "sg" : 0,
      "version" : 1
    }
  ]
};

module.exports.withTrend = {
  "bgUnits" : "MGDL",
  "bgunits" : "MGDL",
  "calibStatus" : "LESS_THAN_NINE_HRS",
  "conduitBatteryLevel" : 86,
  "conduitBatteryStatus" : "FULL",
  "conduitInRange" : true,
  "conduitMedicalDeviceInRange" : true,
  "conduitSensorInRange" : true,
  "conduitSerialNumber" : "0",
  "currentServerTime" : 1445453742878,
  "firstName" : "<redacted>",
  "kind" : "Main",
  "lastConduitTime" : 0,
  "lastConduitUpdateServerTime" : 1445453375436,
  "lastMedicalDeviceDataUpdateServerTime" : 1445453375436,
  "lastName" : "<redacted>",
  "lastSGTrend" : "DOWN",
  "lastSensorTS" : 0,
  "lastSensorTSAsString" : "Oct 21, 2015 13:51:00",
  "lastSensorTime" : 0,
  "medicalDeviceBatteryLevelPercent" : 50,
  "medicalDeviceFamily" : "PARADIGM",
  "medicalDeviceSerialNumber" : "<redacted>",
  "medicalDeviceSuspended" : false,
  "medicalDeviceTime" : 0,
  "medicalDeviceTimeAsString" : "Oct 21, 2015 13:51:00",
  "reservoirAmount" : 67,
  "reservoirLevelPercent" : 50,
  "sLastSensorTime" : "Oct 21, 2015 13:51:00",
  "sMedicalDeviceTime" : "Oct 21, 2015 13:51:00",
  "sensorDurationHours" : 137,
  "sensorState" : "NORMAL",
  "timeFormat" : "HR_24",
  "timeToNextCalibHours" : 6,
  "version" : 1,
  "activeInsulin" : {
    "version" : 1,
    "kind" : "Insulin",
    "datetime" : "Oct 21, 2015 13:47:07",
    "amount" : 1.35
  },
  "lastAlarm" : {
    "kind" : "Alarm",
    "type" : "ALARM",
    "flash" : false,
    "datetime" : "Oct 18, 2015 00:37:23",
    "code" : 101,
    "version" : 1
  },
  "lastSG" : {
    "sg" : 163,
    "kind" : "SG",
    "datetime" : "Oct 21, 2015 13:46:00",
    "timeChange" : false,
    "version" : 1
  },
  "limits" : [
    {
      "kind" : "Limits",
      "lowLimit" : 80,
      "index" : 0,
      "highLimit" : 300,
      "version" : 1
    }
  ],
  "sgs" : [
    {
      "datetime" : "Oct 20, 2015 13:21:00",
      "kind" : "SG",
      "sg" : 191,
      "version" : 1,
      "timeChange" : false
    },
    {
      "version" : 1,
      "timeChange" : false,
      "datetime" : "Oct 20, 2015 13:26:00",
      "sg" : 185,
      "kind" : "SG"
    },
    {
      "kind" : "SG",
      "sg" : 179,
      "datetime" : "Oct 20, 2015 13:31:00",
      "timeChange" : false,
      "version" : 1
    },
    {
      "datetime" : "Oct 20, 2015 13:36:00",
      "sg" : 175,
      "kind" : "SG",
      "version" : 1,
      "timeChange" : false
    },
    {
      "version" : 1,
      "timeChange" : false,
      "datetime" : "Oct 20, 2015 13:41:00",
      "kind" : "SG",
      "sg" : 168
    },
    {
      "datetime" : "Oct 20, 2015 13:46:00",
      "sg" : 163,
      "kind" : "SG",
      "version" : 1,
      "timeChange" : false
    }
  ]
};
