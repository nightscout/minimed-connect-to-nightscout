/* jshint node: true */
"use strict";

var common = require('common'),
  extend = require('extend'),
  request = require('request'),
  zlib = require('zlib');

var logger = require('./logger');

var CARELINK_SECURITY_URL = 'https://carelink.minimed.com/patient/j_security_check';
var CARELINK_AFTER_LOGIN_URL = 'https://carelink.minimed.com/patient/main/login.do';
var CARELINK_LOGIN_COOKIE = '_WL_AUTHCOOKIE_JSESSIONID';
var MAX_RETRY_COUNT = 10;

var carelinkJsonUrlNow = function() {
  return 'https://carelink.minimed.com/patient/connect/ConnectViewerServlet?cpSerialNumber=NONE&msgType=last24hours&requestTime=' + Date.now();
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
  return extend(true, defaults, extra);
}

function haveLoginCookie(jar) {
  return jar.getCookies(CARELINK_SECURITY_URL).filter(function(c) { return c.key == CARELINK_LOGIN_COOKIE; }).length > 0;
}

function responseAsError(response) {
  if (!(response.statusCode >= 200 && response.statusCode < 400)) {
    return new Error(
      "Bad response from CareLink: " +
      JSON.stringify(extend(true, response, {'body': '<redacted>'}))
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

var Client = exports.Client = function (options) {
  if (!(this instanceof Client)) {
    return new Client(arguments[0]);
  }

  if (!options.username) {
    throw new Error('Missing CareLink username');
  } else if(!options.password) {
    throw new Error('Missing CareLink password');
  }

  var jar = request.jar();

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
          } else if (retryCount >= MAX_RETRY_COUNT) {
            logger.log('Retried too many times.');
            next(err);
          }
          var timeout = Math.pow(2, retryCount);
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
    try {
      next(null, JSON.parse(response.body));
    } catch (e) {
      next(e);
    }
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
