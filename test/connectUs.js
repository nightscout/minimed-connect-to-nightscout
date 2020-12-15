/* jshint node: true */
/* globals describe, it */
"use strict";

process.env['MMCONNECT_SERVER'] = "US";

var _ = require('lodash'),
  expect = require('expect.js');

var carelink = require('../carelink.js');

describe('connectUS()', function() {
  var client = carelink.Client({
    username: "nstestuss",
    password: "ournightscoutustest",
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
