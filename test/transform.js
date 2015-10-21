/* jshint node: true */
/* globals describe, it */
"use strict";

var _ = require('lodash'),
  expect = require('expect.js');

var f = require('./fixtures.js'),
  transform = require('../transform.js');

describe('transform()', function() {
  it('should obey sgvLimit', function() {
    var data = f.data();

    expect(
      _.filter(transform(data), {type: 'sgv'}).length
    ).to.eql(data['sgs'].length);

    expect(
      _.filter(transform(data, 4), {type: 'sgv'}).length
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

  describe('active insulin', function() {
    it('should include active insulin as "iob"', function() {
      var pumpStatus = _.filter(
        transform(
          f.data({'activeInsulin': {
            'datetime' : 'Oct 17, 2015 09:09:14',
            'version' : 1,
            'amount' : 1.275,
            'kind' : 'Insulin'
          }})
        ),
        {type: 'pump_status'}
      )[0];

      expect(pumpStatus['iob']).to.be(1.275);
    });

    it('should ignore activeInsulin values of -1', function() {
      var pumpStatus = _.filter(
        transform(
          f.data({'activeInsulin': {
            'datetime' : 'Oct 17, 2015 09:09:14',
            'version' : 1,
            'amount' : -1,
            'kind' : 'Insulin'
          }})
        ),
        {type: 'pump_status'}
      )[0];

      expect(pumpStatus['iob']).to.be(undefined);
    });
  });

  describe('trend', function() {
    var sgs = [
      [95, 'Oct 20, 2015 08:05:00'],
      [105, 'Oct 20, 2015 08:10:00'],
      [108, 'Oct 20, 2015 08:15:00']
    ];

    function transformedSGs(valDatePairs) {
      return _.filter(
        transform(
          f.data({
            'lastSGTrend': 'UP_DOUBLE',
            'sgs': valDatePairs.map(Function.prototype.apply.bind(f.makeSG, null))
          })
        ),
        {type: 'sgv'}
      );
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
});
