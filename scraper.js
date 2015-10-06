var config = require('./config.js');
phantom.casperPath = './vendor/casperjs';
phantom.injectJs('./vendor/casperjs/bin/bootstrap.js');

////////////////////////////////////////////////////////////////
// transmit data from carelink to nightscout
// data looks like this: https://gist.github.com/mddub/b033ec0c800deec02471

var Rusha = require('./vendor/rusha.js');

var isNewData = (function() {
  var lastUpdateTime;

  return function(data) {
    var oldLastUpdateTime = lastUpdateTime;
    lastUpdateTime = data['lastMedicalDeviceDataUpdateServerTime'];
    return lastUpdateTime !== oldLastUpdateTime;
  };
})();

function sendToNightscout(data, callback) {
  var activeIns, timeReportedUTC;
  try {
    activeIns = data['activeInsulin']['amount'];
    timeReportedUTC = Date.parse(data['activeInsulin']['datetime'] + ' ' + config.PUMP_TIMEZONE);
  } catch(e) {
    casper.log('Error parsing JSON data: ' + e.message + ' ' + JSON.stringify(data), 'error');
    return callback.apply(casper);
  }

  casper.log('SENDING TO NIGHTSCOUT: active insulin ' + activeIns + ', reported at ' + new Date(timeReportedUTC).toString(), 'info');

  casper.open(config.NIGHTSCOUT_HOST + '/api/v1/entries.json', {
    method: 'post',
    headers: {
      'api-secret': new Rusha().digest(config.NIGHTSCOUT_API_SECRET),
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    data: JSON.stringify({
      'type': 'reported_active_insulin',
      'device': 'MiniMed Connect ' + data['medicalDeviceFamily'] + ' ' + data['medicalDeviceSerialNumber'],
      'date': timeReportedUTC,
      'dateString': new Date(timeReportedUTC).toISOString(),
      'activeInsulin': activeIns
    })
  }).then(function(response) {
    if(!response.status) {
      casper.log("Error uploading to Nightscout: can't connect to Nightscout host", 'error');
      casper.exit(1);
    } else if(response.status !== 200) {
      casper.log("Error uploading to Nightscout: got status " + response.status + " " + response.statusText, 'error');
      if(response.status === 401) {
        casper.log('Check your API secret.', 'error');
      }
      casper.exit(1);
    } else {
      callback.apply(casper);
    }
  });
}

////////////////////////////////////////////////////////////////
// scrape data from carelink

var CARELINK_LOGIN_URL = 'https://carelink.minimed.com/patient/entry.jsp';

var casper = require('casper').create({
  verbose: true,
  logLevel: 'info',
});
casper.userAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:40.0) Gecko/20100101 Firefox/40.0');

var carelinkBaseUrl;

function carelinkDataUrlNow() {
  return carelinkBaseUrl.replace(/requestTime=\d+/, 'requestTime=' + Date.now());
}

function requestLoop() {
  casper.open(carelinkDataUrlNow()).then(function(response) {
    var data = JSON.parse(this.getPageContent());
    if(isNewData(data)) {
      casper.log(new Date() + ' new data', 'info');
      sendToNightscout(data, function() {
        casper.wait(config.CARELINK_REQUEST_INTERVAL, requestLoop);
      });
    } else {
      casper.log(new Date() + ' no new data', 'info');
      casper.wait(config.CARELINK_REQUEST_INTERVAL, requestLoop);
    }
  });
}

// On page load and then every 5 minutes, the CareLink Connect page will make a request to a url like
// https://carelink.minimed.com/patient/connect/ConnectViewerServlet?cpSerialNumber=NONE&msgType=last24hours&requestTime=1444087771183
casper.on('resource.received', function(resource) {
  if(resource.url.indexOf('/patient/connect/ConnectViewerServlet') !== -1) {
    carelinkBaseUrl = resource.url;
  }
});

casper.start(CARELINK_LOGIN_URL);

// CareLink will often trigger a series of redirects before showing the login form
casper.waitForSelector('form#logon', function() {
  casper.fill('#logon', {'j_username': config.CARELINK_USERNAME, 'j_password': config.CARELINK_PASSWORD}, true);
});

casper.then(function() {
  casper.open('https://carelink.minimed.com/patient/connect/mobile.do');
});

casper.waitFor(
  function() {
    return !!carelinkBaseUrl;
  },
  requestLoop,
  function() {
    casper.log('CareLink Connect page never made request for JSON', 'error');
    casper.exit();
  },
  60 * 1000
);

casper.run();
