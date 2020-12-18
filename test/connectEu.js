/* jshint node: true */
/* globals describe, it */
"use strict";

process.env['MMCONNECT_SERVER'] = "EU";
process.env['MMCONNECT_COUNTRYCODE'] = "gb";

var _ = require('lodash'),
  expect = require('expect.js');

var carelink = require('../carelink.js');

describe('connectEu()', function() {
  var client = carelink.Client({
    username: "nstesteu",
    password: "ournightscouteutest",
  });

  it('should save without error', function (done) {
    client.fetch(function (err, data) {
      if (err) {
        done(err)
      }
      else {
        expect(data).to.have.property('bgunits');
        done();
      }
    })
  });
});
