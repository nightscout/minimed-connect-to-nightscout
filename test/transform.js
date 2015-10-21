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

  it('should include active insulin as "iob"', function() {
    var pumpStatus = transform(
      f.data({'activeInsulin': {
        'datetime' : 'Oct 17, 2015 09:09:14',
        'version' : 1,
        'amount' : 1.275,
        'kind' : 'Insulin'
      }})
    ).filter(function(e) { return e['type'] === 'pump_status'; })[0];

    expect(pumpStatus['iob']).to.be(1.275);
  });

  it('should ignore activeInsulin values of -1', function() {
    var pumpStatus = transform(
      f.data({'activeInsulin': {
        'datetime' : 'Oct 17, 2015 09:09:14',
        'version' : 1,
        'amount' : -1,
        'kind' : 'Insulin'
      }})
    ).filter(function(e) { return e['type'] === 'pump_status'; })[0];

    expect(pumpStatus['iob']).to.be(undefined);
  });
});
