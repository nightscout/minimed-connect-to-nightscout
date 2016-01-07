/* jshint node: true */
"use strict";

var _ = require('lodash'),
  common = require('common'),
  request = require('request');

var logger = require('./logger');

var DEFAULT_MAX_RETRY_DURATION = module.exports.defaultMaxRetryDuration = 512;

var CARELINK_SECURITY_URL = 'https://carelink.minimed.com/patient/j_security_check';
var CARELINK_AFTER_LOGIN_URL = 'https://carelink.minimed.com/patient/main/login.do';
var CARELINK_JSON_BASE_URL = 'https://carelink.minimed.com/patient/connect/ConnectViewerServlet?cpSerialNumber=NONE&msgType=last24hours&requestTime=';
var CARELINK_LOGIN_COOKIE = '_WL_AUTHCOOKIE_JSESSIONID';

var carelinkJsonUrlNow = function() {
  return CARELINK_JSON_BASE_URL + Date.now();
};

function reqOptions(extra) {
  var defaults = {
    jar: true,
    followRedirect: false,
    headers: {
      Host: 'carelink.minimed.com',
      Connection: 'keep-alive',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:41.0) Gecko/20100101 Firefox/41.0',
      'Accept-Encoding': 'gzip,deflate,sdch',
      'Accept-Language': 'en-US,en;q=0.8'
    }
  };
  return _.merge(defaults, extra);
}

function haveLoginCookie(jar) {
  return _.some(jar.getCookies(CARELINK_SECURITY_URL), {key: CARELINK_LOGIN_COOKIE});
}

function responseAsError(response) {
  if (!(response.statusCode >= 200 && response.statusCode < 400)) {
    return new Error(
      "Bad response from CareLink: " +
      JSON.stringify(_.merge(response, {'body': '<redacted>'}))
    );
  } else {
    return null;
  }
}

function checkResponseThen(fn) {
  return function(err, response) {
    err = err || responseAsError(response);
    fn.apply(this, [err].concat(Array.prototype.slice.call(arguments, 1)));
  };
}

function retryDurationOnAttempt(n) {
  return Math.pow(2, n);
}

function totalDurationAfterNextRetry(n) {
  var sum = 0;
  for(var i = 0; i <= n; i++) {
    sum += retryDurationOnAttempt(i);
  }
  return sum;
}

var Client = exports.Client = function (options) {
  if (!(this instanceof Client)) {
    return new Client(arguments[0]);
  }

  var jar = request.jar();

  if (options.maxRetryDuration === undefined) {
    options.maxRetryDuration = DEFAULT_MAX_RETRY_DURATION;
  }

  function doLogin(next) {
    logger.log('POST ' + CARELINK_SECURITY_URL);
    request.post(
      CARELINK_SECURITY_URL,
      reqOptions({
        jar: jar,
        qs: {j_username: options.username, j_password: options.password}
      }),
      checkResponseThen(next)
    );
  }

  function doFetchCookie(response, next) {
    logger.log('GET ' + CARELINK_AFTER_LOGIN_URL);
    request.get(
      CARELINK_AFTER_LOGIN_URL,
      reqOptions({jar: jar}),
      checkResponseThen(next)
    );
  }

  function getConnectData(response, next, retryCount) {
    var url = carelinkJsonUrlNow();
    logger.log('GET ' + url);
    var resp = request.get(
      url,
      reqOptions({jar: jar, gzip: true}),
      checkResponseThen(function(err, response) {
        if (err) {
          logger.log(err);
          if (retryCount === undefined ) {
            retryCount = 0;
          } else if (totalDurationAfterNextRetry(retryCount) >= options.maxRetryDuration) {
            logger.log('Retried for too long (' + totalDurationAfterNextRetry(retryCount - 1) + ' seconds).');
            next(err);
          }
          var timeout = retryDurationOnAttempt(retryCount);
          logger.log('Trying again in ' + timeout + ' second(s)...');
          setTimeout(function() {
            getConnectData(response, next, retryCount + 1);
          }, 1000 * timeout);
        } else {
          next(null, response);
        }
      })
    );
  }

  function parseData(response, next) {
    var parsed;
    try {
      parsed = JSON.parse(response.body);
    } catch (e) {
      next(e);
    }
    next(null, parsed);
  }

  function firstFetch(callback) {
    common.step(
      [
        doLogin,
        doFetchCookie,
        getConnectData,
        parseData,
        callback.bind(null, null),
      ],
      callback
    );
  }

  function fetchLoggedIn(callback) {
    common.step(
      [
        getConnectData,
        parseData,
        callback.bind(null, null),
      ],
      function onError(err) {
        logger.log('Fetch JSON failed; logging in again');
        firstFetch(callback);
      }
    );
  }

  function fetch(callback) {
    if (haveLoginCookie(jar)) {
      fetchLoggedIn(callback);
    } else {
      logger.log('Logging in to CareLink');
      firstFetch(callback);
    }
  }

  return {
    fetch: fetch
  };
};
