/* jshint node: true */
"use strict";

var crypto = require('crypto'),
  axios = require('axios');

var logger = require('./logger');

var upload = module.exports.upload = function(entries, endpoint, secret, callback) {
  logger.log('POST ' + endpoint + ' ' + JSON.stringify(entries));
  axios.post(
    endpoint,
    {
      data: entries,
      headers: {
        'content-type': 'application/json',
        'api-secret': crypto.createHash('sha1').update(secret).digest('hex')
      }
  })
  .then(function (response) {
    callback(null, response);
  })
  .catch(function (err) {
    callback(err);
  });
};
