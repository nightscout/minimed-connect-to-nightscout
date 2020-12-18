
/* jshint node: true */
/* globals describe, it */
"use strict";

process.env['MMCONNECT_SERVER'] = "EU";
process.env['MMCONNECT_COUNTRYCODE'] = "gb";

var _ = require('lodash'),
  expect = require('expect.js');

var carelink = require('../carelink.js');

describe('multitenant use of lib', function() {

  it('should fetch EU without error', function (done) {
    var client = carelink.Client({
      username: "nstesteu",
      password: "ournightscouteutest",
      server: 'EU',
    });
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


  it('should fetch US without error', function (done) {
    var client = carelink.Client({
      username: "nstestuss",
      password: "ournightscoutustest",
      countrycode: 'us',
      server: 'carelink.minimed.com',
    });
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
