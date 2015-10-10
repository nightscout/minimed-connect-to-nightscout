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

function assertNotBadResponse(response) {
  if (response !== undefined && !(response.statusCode >= 200 && response.statusCode < 400)) {
    throw new Error("Bad response from CareLink: " + JSON.stringify(extend(true, response, {'body': '<redacted>'})));
  }
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
    request.post(
      CARELINK_SECURITY_URL,
      reqOptions({
        jar: jar,
        qs: {j_username: options.username, j_password: options.password}
      }),
      next
    );
  }

  function doFetchCookie(response, next) {
    assertNotBadResponse(response);
    request.get(
      CARELINK_AFTER_LOGIN_URL,
      reqOptions({jar: jar}),
      next
    );
  }

  function getConnectData(response, next) {
    assertNotBadResponse(response);
    var url = carelinkJsonUrlNow();
    logger.log('GET ' + url);
    var resp = request.get(
      url,
      reqOptions({jar: jar, gzip: true}),
      next
    );
  }

  function parseData(response, next) {
    assertNotBadResponse(response);
    try {
      next(undefined, JSON.parse(response.body));
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
        callback
      ],
      function onError(err) {
        console.log(err);
        process.exit(1);
      }
    );
  }

  function fetchLoggedIn(callback) {
    common.step(
      [
        getConnectData,
        parseData,
        callback
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
