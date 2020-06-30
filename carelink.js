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
var CARELINKEU_LOGIN_URL = 'https://' + carelinkServerAddress + '/patient/sso/login?country=gb&lang=en';
var CARELINKEU_REFRESH_TOKEN_URL = 'https://' + carelinkServerAddress + '/patient/sso/reauth';
var CARELINKEU_JSON_BASE_URL = 'https://' + carelinkServerAddress + '/patient/connect/data?cpSerialNumber=NONE&msgType=last24hours&requestTime=';
var CARELINKEU_TOKEN_COOKIE = 'auth_tmp_token';
var CARELINKEU_TOKENEXPIRE_COOKIE = 'c_token_valid_to';

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
        //rejectUnauthorized: false,
        //secure: false,
        changeOrigin: true,
        headers: {
            //Host: carelinkServerAddress,
            Connection: 'keep-alive',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.10; rv:41.0) Gecko/20100101 Firefox/41.0',
            'Accept-Encoding': 'gzip,deflate,sdch',
            'Accept-Language': 'en-US,en;q=0.8'
        },
        /*checkServerIdentity: function (host, cert) {
            return undefined;
        }*/
    };
    return _.merge(defaults, extra);
}

/*function haveLoginCookie(jar) {
    if (CARELINK_EU)
        return _.some(jar.getCookies(CARELINKEU_SERVER_ADDRESS), {key: CARELINKEU_TOKEN_COOKIE});
    else
        return _.some(jar.getCookies(CARELINK_SECURITY_URL), {key: CARELINK_LOGIN_COOKIE});
}*/

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

    function getCookies() {
        return jar.getCookies(CARELINK_EU ? CARELINKEU_SERVER_ADDRESS : CARELINK_SECURITY_URL);
    }

    function haveCookie(cookieName) {
        return _.some(getCookies(), {key: cookieName});
    }

    function getCookie(cookieName) {
        return _.find(getCookies(), {key: cookieName});
    }

    function getHost(url) {
        return new URL(url).host;
    }

    function getPath(url) {
        let u = new URL(url);
        return `${u.pathname}${u.search}`;
    }

    function doLogin(next) {
        let url = CARELINK_SECURITY_URL;
        logger.log('POST ' + url);

        request.post(
            url,
            reqOptions({
                jar: jar,
                form: {
                    j_username: options.username,
                    j_password: options.password,
                    j_character_encoding: "UTF-8"
                },
            }),
            checkResponseThen(next)
        );
    }

    function doFetchCookie(response, next) {
        let url = CARELINK_AFTER_LOGIN_URL;
        logger.log('GET ' + url);
        request.get(
            url,
            reqOptions({
                jar: jar,
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu1(next) {
        let url = CARELINKEU_LOGIN_URL;
        logger.log('GET ' + url);

        request.get(
            url,
            reqOptions({
                jar: jar,
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
            }),
            checkResponseThen(next)
        );
    }

    function doLoginEu3(response, next) {
        let uri = new URL(response.headers.location);
        let uriParam = uri.searchParams;

        let url = `${uri.origin}${uri.pathname}?locale=${uriParam.get('locale')}&countrycode=${uriParam.get('countrycode')}`;
        logger.log('POST ' + url);

        request.post(
            url,
            reqOptions({
                jar: jar,
                gzip: true,
                form: {
                    sessionID: uriParam.get('sessionID'),
                    sessionData: uriParam.get('sessionData'),
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
        let regex = /(<form action=")(.*)" method="POST"/gm;
        let url = (regex.exec(response.body) || [])[2] || '';

        logger.log('GET ' + url);

        // Session data is changed, need to get it from the html body form
        regex = /(sessionID=)([^&]+)/gm;
        let sessionId = (regex.exec(response.request.body) || [])[2] || '';

        regex = /(<input type="hidden" name="sessionData" value=")(.*)"/gm;
        let sessionData = (regex.exec(response.body)[2] || []) || '';

        request.post(
            url,
            reqOptions({
                jar: jar,
                form: {
                    action: "consent",
                    sessionID: sessionId,
                    sessionData: sessionData,
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
            }),
            checkResponseThen(next)
        );
    }

    function refreshTokenEu(next) {
        let url = CARELINKEU_REFRESH_TOKEN_URL;
        logger.log('Refresh auth token');

        request.post(
            url,
            reqOptions({
                jar: jar,
                gzip: true,
                json: true,
                headers: {
                    Authorization: "Bearer " + _.get(getCookie(CARELINKEU_TOKEN_COOKIE), 'value', ''),
                },
            }),
            function (err, response) {
                err = err || responseAsError(response);

                if (err) {
                    // reset cookie jar and do the login again
                    jar = request.jar();
                    checkLogin(next);
                } else {
                    next();
                }
            },
        );
    }

    function getConnectData(response, next, retryCount) {
        var url = carelinkJsonUrlNow();
        logger.log('GET ' + url);

        var reqO = {
            jar: jar,
            gzip: true,
            headers: {},
        };
        if (CARELINK_EU) {
            reqO.headers.Authorization = "Bearer " + _.get(getCookie(CARELINKEU_TOKEN_COOKIE), 'value', '');
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
                        if (CARELINK_EU) {
                            refreshTokenEu(function () {
                                getConnectData(response, next, retryCount + 1);
                            });
                        } else {
                            getConnectData(response, next, retryCount + 1);
                        }
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

    function checkLogin(next) {
        if (CARELINK_EU) {
            // EU - SSO method
            if (haveCookie(CARELINKEU_TOKEN_COOKIE)) {
                let expire = new Date(Date.parse(_.get(getCookie(CARELINKEU_TOKENEXPIRE_COOKIE), 'value', '2999-01-01')));

                if (expire < new Date(Date.now() - 10 * 1000 * 60)) {
                    refreshTokenEu(next);
                } else {
                    next(null, null);
                }
            } else {
                common.step([
                        doLoginEu1,
                        doLoginEu2,
                        doLoginEu3,
                        doLoginEu4,
                        doLoginEu5,
                        next.bind(null, null),
                    ],
                );
            }
        } else {
            // US - Cookie method
            if (haveCookie(CARELINK_LOGIN_COOKIE)) {
                next(null);
            } else {
                logger.log('Logging in to CareLink');

                common.step([
                        doLogin,
                        doFetchCookie,
                        next.bind(null, null)
                    ]
                );
            }
        }
    }

    function fetch(callback) {
        common.step(
            [
                checkLogin,
                getConnectData,
                parseData,
                callback.bind(null, null),
            ],
            callback
        );
    }

    return {
        fetch: fetch
    };
};
