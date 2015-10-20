/* jshint node: true */
/* globals describe, it */
"use strict";

var expect = require('expect.js');

var f = require('./fixtures.js'),
  transform = require('../transform.js');

describe('transform()', function() {
  it('should obey sgvLimit', function() {
    var data = f.data();

    expect(
      transform(data)
        .filter(function(e) { return e['type'] === 'sgv'; })
        .length
    ).to.eql(data['sgs'].length);

    expect(
      transform(data, 4)
        .filter(function(e) { return e['type'] === 'sgv'; })
        .length
    ).to.be(4);
  });

  it('should include pump device family', function() {
    expect(
      transform(
        f.data({'medicalDeviceFamily': 'foo'})
      )[0]['device']
    ).to.be('connect://foo');
  });

  it('should discard data more than 20 minutes old', function() {
    var now = Date.now();
    var THRESHOLD = 20;
    var boundary = now - THRESHOLD * 60 * 1000;
    expect(
      transform(
        f.data({'currentServerTime': now, 'lastMedicalDeviceDataUpdateServerTime': boundary})
      ).length
    ).to.be.greaterThan(0);

    expect(
      transform(
        f.data({'currentServerTime': now, 'lastMedicalDeviceDataUpdateServerTime': boundary - 1})
      ).length
    ).to.be(0);
  });
});
