/* jshint node: true */
"use strict";

var _ = require('lodash'),
    axios = require('axios').default,
    axiosCookieJarSupport = require('axios-cookiejar-support').default,
    tough = require('tough-cookie'),
    qs = require('qs');

var logger = require('./logger');

var MMCONNECT_SERVER = process.env['MMCONNECT_SERVER'];
var CARELINK_EU = MMCONNECT_SERVER === 'EU';
var MMCONNECT_SERVERNAME = process.env['MMCONNECT_SERVERNAME'];

var DEFAULT_MAX_RETRY_DURATION = module.exports.defaultMaxRetryDuration = 512;
var carelinkServerAddress = MMCONNECT_SERVERNAME || (CARELINK_EU ? "carelink.minimed.eu" : "carelink.minimed.com");

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

var Client = exports.Client = function (options) {
    if (!(this instanceof Client)) {
        return new Client(arguments[0]);
    }

    axiosCookieJarSupport(axios);
    var cookieJar = new tough.CookieJar();
    axios.defaults.jar = new tough.CookieJar();
    axios.defaults.maxRedirects = 0;
    axios.defaults.withCredentials = true;
    axios.interceptors.response.use(function (response) {
        // Do something with response data
        return response;
    }, function (error) {
        if (error.response && error.response.status >= 200 && error.response.status < 400) {
            return error.response;
        } else {
            // Do something with response error
            return Promise.reject(error);
        }
    });

    if (options.maxRetryDuration === undefined) {
        options.maxRetryDuration = DEFAULT_MAX_RETRY_DURATION;
    }

    function getCookies() {
        let cookies = [];
        axios.defaults.jar.store.getAllCookies(function (err, cookieArray) {
            if (err)
                cookies = [];
            cookies = cookieArray;
        });

        return cookies.filter(c => c.domain === carelinkServerAddress);
    }

    function haveCookie(cookieName) {
        return _.some(getCookies(), {key: cookieName});
    }

    function getCookie(cookieName) {
        return _.find(getCookies(), {key: cookieName});
    }

    async function doLogin() {
        return await axios.post(
            CARELINK_SECURITY_URL,
            qs.stringify({
                j_username: options.username,
                j_password: options.password,
                j_character_encoding: "UTF-8"
            }));
    }

    async function doFetchCookie() {
        return await axios.get(CARELINK_AFTER_LOGIN_URL);
    }

    async function doLoginEu1() {
        return await axios.get(CARELINKEU_LOGIN_URL);
    }

    async function doLoginEu2(response) {
        return await axios.get(response.headers.location);
    }

    async function doLoginEu3(response) {
        let uri = new URL(response.headers.location);
        let uriParam = uri.searchParams;

        let url = `${uri.origin}${uri.pathname}?locale=${uriParam.get('locale')}&countrycode=${uriParam.get('countrycode')}`;

        response = await axios.post(url, qs.stringify({
            sessionID: uriParam.get('sessionID'),
            sessionData: uriParam.get('sessionData'),
            locale: "en",
            action: "login",
            username: options.username,
            password: options.password,
            actionButton: "Log in",
        }));

        if (_.get(response, 'data', '').includes(uri.pathname))
            throw new Error('Carelink invalid username or password');

        return response;
    }

    async function doLoginEu4(response) {
        let regex = /(<form action=")(.*)" method="POST"/gm;
        let url = (regex.exec(response.data) || [])[2] || '';

        // Session data is changed, need to get it from the html body form
        regex = /(<input type="hidden" name="sessionID" value=")(.*)"/gm;
        let sessionId = (regex.exec(response.data) || [])[2] || '';

        regex = /(<input type="hidden" name="sessionData" value=")(.*)"/gm;
        let sessionData = (regex.exec(response.data)[2] || []) || '';

        return await axios.post(url, qs.stringify({
            action: "consent",
            sessionID: sessionId,
            sessionData: sessionData,
            response_type: "code",
            response_mode: "query",
        }), {
            maxRedirects: 0,
        });
    }

    async function doLoginEu5(response) {
        return await axios.get(response.headers.location, {maxRedirects: 0});
    }

    async function refreshTokenEu() {
        return await axios.post(
            CARELINKEU_REFRESH_TOKEN_URL,
            {},
            {
                headers: {
                    Authorization: "Bearer " + _.get(getCookie(CARELINKEU_TOKEN_COOKIE), 'value', ''),
                },
            },
        ).catch(async function (error) {
            if (error.response && error.response.status === 401) {
                // Login again
                await checkLogin();
            } else {
                throw error;
            }
        });
    }

    async function getConnectData() {
        var url = carelinkJsonUrlNow();
        logger.log('GET ' + url);

        var config = {
            headers: {},
        };
        if (CARELINK_EU) {
            config.headers.Authorization = "Bearer " + _.get(getCookie(CARELINKEU_TOKEN_COOKIE), 'value', '');
        }

        return await axios.get(url, config);
    }

    async function checkLogin() {
        if (CARELINK_EU) {
            // EU - SSO method
            if (haveCookie(CARELINKEU_TOKEN_COOKIE) || haveCookie(CARELINKEU_TOKENEXPIRE_COOKIE)) {
                let expire = new Date(Date.parse(_.get(getCookie(CARELINKEU_TOKENEXPIRE_COOKIE), 'value')));

                // Refresh token if expires in 10 minutes
                if (expire < new Date(Date.now() + 10 * 1000 * 60))
                    await refreshTokenEu();
            } else {
                logger.log('Logging in to CareLink');
                let response = await doLoginEu1();
                response = await doLoginEu2(response);
                response = await doLoginEu3(response);
                response = await doLoginEu4(response);
                await doLoginEu5(response);
            }
        } else {
            // US - Cookie method
            if (!haveCookie(CARELINK_LOGIN_COOKIE)) {
                logger.log('Logging in to CareLink');
                let response = await doLogin()
                await doFetchCookie(response)
            }
        }
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    async function fetch(callback) {
        try {
            let maxRetry = 3;
            for (let i = 1; i <= maxRetry; i++) {
                await checkLogin();
                try {
                    let response = await getConnectData();
                    callback(null, response.data);
                    return;
                } catch (e1) {
                    if (i === maxRetry)
                        throw e1;

                    if (e1.response && e1.response.status === 401) {
                        // reauth
                        cookieJar.removeAllCookiesSync();
                    }

                    let timeout = retryDurationOnAttempt(i);
                    await sleep(1000 * timeout);
                }
            }

            throw new Error('Failed to download Carelink data');
        } catch (e) {
            callback(`${e.toString()}\nstack: ${e.stack}`, null);
        }
    }

    return {
        fetch: fetch
    };
};
