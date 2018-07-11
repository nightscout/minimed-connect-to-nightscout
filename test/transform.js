/* jshint node: true */
/* globals describe, it */
"use strict";

var _ = require('lodash'),
  expect = require('expect.js');

var f = require('./_fixtures.js'),
  transform = require('../transform.js');

describe('transform()', function() {
  it('should obey sgvLimit', function() {
    var data = f.data();

    expect(
      transform(data).entries.length
    ).to.eql(data['sgs'].length);

    expect(
      transform(data, 4).entries.length
    ).to.be(4);
  });

  it('should include pump device family', function() {
    expect(
      transform(
        f.data({'medicalDeviceFamily': 'foo'})
      ).entries[0]['device']
    ).to.be('connect://foo');
  });

  it('should discard data more than 20 minutes old', function() {
    var pumpTimeString = 'Oct 17, 2015 09:06:33';
    var now = Date.parse('Oct 17, 2015 09:09:14');
    var THRESHOLD = 20;
    var boundary = now - THRESHOLD * 60 * 1000;
    expect(
      transform(
        f.data({
          'sMedicalDeviceTime': pumpTimeString,
          'currentServerTime': now,
          'lastMedicalDeviceDataUpdateServerTime': boundary,
        })
      ).entries.length
    ).to.be.greaterThan(0);

    expect(
      transform(
        f.data({
          'sMedicalDeviceTime': pumpTimeString,
          'currentServerTime': now,
          'lastMedicalDeviceDataUpdateServerTime': boundary - 1,
        })
      ).entries.length
    ).to.be(0);
  });

  describe('active insulin', function() {
    it('should include active insulin', function() {
      var pumpStatus = transform(
        f.data({'activeInsulin': {
          'datetime' : 'Oct 17, 2015 09:09:14',
          'version' : 1,
          'amount' : 1.275,
          'kind' : 'Insulin'
        }})
      ).devicestatus[0];

      expect(_.get(pumpStatus, 'pump.iob.bolusiob')).to.be(1.275);
    });

    it('should ignore activeInsulin values of -1', function() {
      var pumpStatus = transform(
        f.data({'activeInsulin': {
          'datetime' : 'Oct 17, 2015 09:09:14',
          'version' : 1,
          'amount' : -1,
          'kind' : 'Insulin'
        }})
      ).devicestatus[0];

      expect(_.get(pumpStatus, 'pump.iob.bolusiob')).to.be(undefined);
    });
  });

  describe('trend', function() {
    var sgs = [
      [95, 'Oct 20, 2015 08:05:00'],
      [105, 'Oct 20, 2015 08:10:00'],
      [108, 'Oct 20, 2015 08:15:00']
    ];

    function transformedSGs(valDatePairs) {
      return transform(
        f.data({
          'lastSGTrend': 'UP_DOUBLE',
          'sgs': valDatePairs.map(Function.prototype.apply.bind(f.makeSG, null))
        })
      ).entries;
    }

    it('should add the trend to the last sgv', function() {
      var sgvs = transformedSGs(sgs);
      expect(sgvs.length).to.be(3);
      expect(sgvs[sgvs.length - 1]['sgv']).to.be(108);
      expect(sgvs[sgvs.length - 1]['direction']).to.be('DoubleUp');
      expect(sgvs[sgvs.length - 1]['trend']).to.be(1);
    });

    it('should not add a trend if the most recent sgv is absent', function() {
      var sgvs = transformedSGs(sgs.concat([[0, 'Oct 20, 2015 08:20:00']]));
      expect(sgvs.length).to.be(3);
      expect(sgvs[sgvs.length - 1]['sgv']).to.be(108);
      expect(sgvs[sgvs.length - 1]['direction']).to.be(undefined);
      expect(sgvs[sgvs.length - 1]['trend']).to.be(undefined);
    });
  });

  describe('uploader battery', function() {
    it('should use the Connect battery level as uploader.battery', function() {
      var pumpStatus = transform(
        f.data({'conduitBatteryLevel': 76})
      ).devicestatus[0];
      expect(pumpStatus.uploader.battery).to.be(76);
    });
  });
});
