/* jshint node: true */
"use strict";

var _ = require('lodash'),
    common = require('common'),
    request = require('request');

var logger = require('./logger');

var CARELINK_EU = process.env['MMCONNECT_SERVER'] === 'EU';

var DEFAULT_MAX_RETRY_DURATION = module.exports.defaultMaxRetryDuration = 512;
var carelinkServerAddress = CARELINK_EU ? "carelink.minimed.eu" : "carelink.minimed.com";

var CARELINKEU_SERVER_ADDRESS = 'https://' + carelinkServerAddress;
var CARELINKEU_LOGIN1_URL = 'https://' + carelinkServerAddress + '/patient/sso/login?country=gb&lang=en';
var CARELINKEU_LOGIN3_URL = 'https://mdtlogin.medtronic.com/mmcl/auth/oauth/v2/authorize/login?country=gb&lang=en';
var CARELINKEU_LOGIN4_URL = 'https://mdtlogin.medtronic.com/mmcl/auth/oauth/v2/authorize/consent';
var CARELINKEU_JSON_BASE_URL = 'https://' + carelinkServerAddress + '/patient/connect/data?cpSerialNumber=NONE&msgType=last24hours&requestTime=';
var CARELINKEU_LOGIN_COOKIE = 'auth_tmp_token';

var CARELINK_SECURITY_URL = 'https://' + carelinkServerAddress + '/patient/j_security_check';
var CARELINK_AFTER_LOGIN_URL = 'https://' + carelinkServerAddress + '/patient/main/login.do';
var CARELINK_JSON_BASE_URL = 'https://' + carelinkServerAddress + '/patient/connect/ConnectViewerServlet?cpSerialNumber=NONE&msgType=last24hours&requestTime=';
var CARELINK_LOGIN_COOKIE = '_WL_AUTHCOOKIE_JSESSIONID';

var carelinkJsonUrlNow = function () {
    return (CARELINK_EU ? CARELINKEU_JSON_BASE_URL : CARELINK_JSON_BASE_URL) + Date.now();
};

function reqOptions(extra) {
    var defaults = {
        jar: true,
        followRedirect: false,
        headers: {
            Host: carelinkServerAddress,
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
    if (CARELINK_EU)
        return _.some(jar.getCookies(CARELINKEU_SERVER_ADDRESS), {key: CARELINKEU_LOGIN_COOKIE});
    else
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
    return function (err, response) {
        err = err || responseAsError(response);
        fn.apply(this, [err].concat(Array.prototype.slice.call(arguments, 1)));
    };
}

function retryDurationOnAttempt(n) {
    return Math.pow(2, n);
}

function totalDurationAfterNextRetry(n) {
    var sum = 0;
    for (var i = 0; i <= n; i++) {
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
                form: {j_username: options.username, j_password: options.password, j_character_encoding: "UTF-8"}
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

    var params = function (url) {
        let q = url.split('?'), result = {};
        if (q.length >= 1) {
            q[q.length >= 2 ? 1 : 0].split('&').forEach((item) => {
                try {
                    result[item.split('=')[0]] = item.split('=')[1];
                } catch (e) {
                    result[item.split('=')[0]] = '';
                }
            })
        }
        return result;
    }

    function doLoginEu1(next) {
        logger.log('GET ' + CARELINKEU_LOGIN1_URL);

        request.get(
            CARELINKEU_LOGIN1_URL,
            reqOptions({
                jar: jar,
                rejectUnauthorized: false,
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu2(response, next) {
        let url = response.headers.location;

        logger.log('GET ' + url);

        request.get(
            url,
            reqOptions({
                jar: jar,
                rejectUnauthorized: false,
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu3(response, next) {
        logger.log('POST ' + CARELINKEU_LOGIN3_URL);

        let ps = params(response.headers.location);

        request.post(
            CARELINKEU_LOGIN3_URL,
            reqOptions({
                jar: jar,
                rejectUnauthorized: false,
                changeOrigin: true,
                gzip: true,
                form: {
                    sessionID: ps.sessionID,
                    sessionData: ps.sessionData,
                    locale: "en",
                    action: "login",
                    username: options.username,
                    password: options.password,
                    actionButton: "Log in",
                }
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu4(response, next) {
        logger.log('GET ' + CARELINKEU_LOGIN4_URL);

        let ps = params(response.request.body);

        const regex = /(<input type="hidden" name="sessionData" value=")(.*)"/gm;
        ps.sessionData = regex.exec(response.body)[2];

        request.post(
            CARELINKEU_LOGIN4_URL,
            reqOptions({
                jar: jar,
                rejectUnauthorized: false,
                changeOrigin: true,
                form: {
                    action: "consent",
                    sessionID: ps.sessionID,
                    sessionData: ps.sessionData,
                    response_type: "code",
                    response_mode: "query",
                }
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu5(response, next) {
        let url = response.headers.location;

        logger.log('GET ' + url);

        request.get(
            url,
            reqOptions({
                jar: jar,
                rejectUnauthorized: false,
                changeOrigin: true,
            }),
            checkResponseThen(next)
        );
    }

    function getConnectData(response, next, retryCount) {
        var url = carelinkJsonUrlNow();
        logger.log('GET ' + url);

        var reqO = {jar: jar, gzip: true};
        if (CARELINK_EU) {
            var cookie = _.find(jar.getCookies(CARELINKEU_SERVER_ADDRESS), { key: 'auth_tmp_token' });
            reqO.headers = {
                Authorization: "Bearer " + cookie.value,
            };
        }

        var resp = request.get(
            url,
            reqOptions(reqO),
            checkResponseThen(function (err, response) {
                if (err) {
                    logger.log(err);
                    if (retryCount === undefined) {
                        retryCount = 0;
                    } else if (totalDurationAfterNextRetry(retryCount) >= options.maxRetryDuration) {
                        logger.log('Retried for too long (' + totalDurationAfterNextRetry(retryCount - 1) + ' seconds).');
                        next(err);
                    }
                    var timeout = retryDurationOnAttempt(retryCount);
                    logger.log('Trying again in ' + timeout + ' second(s)...');
                    setTimeout(function () {
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
        var funcs = [
            getConnectData,
            parseData,
            callback.bind(null, null),
        ];
        if (CARELINK_EU) {
            funcs = [
                doLoginEu1,
                doLoginEu2,
                doLoginEu3,
                doLoginEu4,
                doLoginEu5,
                ...funcs];
        } else {
            funcs = [
                doLogin,
                doFetchCookie,
                ...funcs];
        }

        common.step(
            funcs,
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
