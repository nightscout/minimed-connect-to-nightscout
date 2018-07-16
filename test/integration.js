/* jshint node: true */
/* globals describe, it */
"use strict";

var _ = require('lodash'),
  expect = require('expect.js');

var samples = require('./_samples'),
  transform = require('../transform');

describe('integration test: missingLastSgv', function() {
  var sample = samples.missingLastSgv;
  var transformed = transform(sample);
  var pumpStatuses = transformed.devicestatus;
  var sgvs = transformed.entries;

  it('should set the pump status time based on the "last device data update time"', function() {
    expect(pumpStatuses[0]['created_at']).to.equal(new Date(sample['lastMedicalDeviceDataUpdateServerTime']).toISOString());
  });

  it('should have one pump_status and 5 sgv entries', function() {
    expect(pumpStatuses.length).to.be(1);
    expect(sgvs.length).to.be(5);
  });

  it('should pull the right sgvs', function() {
    expect(_.map(sgvs, 'sgv')).to.eql([70, 69, 68, 65, 66]);
  });

  it('should correctly deduce that the pump time offset is -0700', function() {
    expect(_.map(sgvs, 'date')).to.eql(
      [1445266500000, 1445266800000, 1445267100000, 1445267400000, 1445267700000]
    );
  });

  it('should not include a trend for any sgv', function() {
    expect(_.uniq(_.map(sgvs, 'direction'))).to.eql([undefined]);
  });

  it('should include pump status data, including active insulin', function() {
    _.forEach({
      'uploader.battery': 29,
      'pump.battery.percent': 75,
      'pump.reservoir': 60,
      'pump.iob.bolusiob': 4.85,
      'pump.iob.timestamp': new Date(sample['lastMedicalDeviceDataUpdateServerTime']).toISOString(),
      'connect.calibStatus': 'LESS_THAN_TWELVE_HRS',
      'connect.conduitInRange': true,
      'connect.conduitMedicalDeviceInRange': true,
      'connect.conduitSensorInRange': true,
      'connect.sensorDurationHours': 73,
      'connect.sensorState': 'NORMAL',
      'connect.timeToNextCalibHours': 10,
      'device': 'connect://paradigm',
    }, function(val, key) {
      expect(_.get(pumpStatuses[0], key)).to.be(val);
    });
  });
});

describe('integration test: withTrend', function() {
  var sample = samples.withTrend;
  var transformed = transform(sample);
  var pumpStatuses = transformed.devicestatus;
  var sgvs = transformed.entries;

  it('should have one pump_status and 6 sgv entries', function() {
    expect(pumpStatuses.length).to.be(1);
    expect(sgvs.length).to.be(6);
  });

  it('should pull the right sgvs', function() {
    expect(_.map(sgvs, 'sgv')).to.eql([191, 185, 179, 175, 168, 163]);
  });

  it('should correctly deduce that the pump time offset is -0500', function() {
    expect(_.map(sgvs, 'date')).to.eql(
      [1445365260000, 1445365560000, 1445365860000, 1445366160000, 1445366460000, 1445366760000]
    );
  });

  it('should include a SingleDown direction/trend on the last sgv', function() {
    function assertCount(key, value, count) {
      expect(sgvs.filter(function(s) { return s[key] === value; }).length).to.be(count);
    }

    assertCount('direction', undefined, 5);
    assertCount('trend', undefined, 5);
    assertCount('direction', 'SingleDown', 1);
    assertCount('trend', 6, 1);

    expect(sgvs[sgvs.length - 1]['direction']).to.be('SingleDown');
    expect(sgvs[sgvs.length - 1]['trend']).to.be(6);
  });

  it('should include pump status data, including active insulin', function() {
    _.forEach({
      'uploader.battery': 86,
      'pump.battery.percent': 50,
      'pump.reservoir': 67,
      'pump.iob.bolusiob': 1.35,
      'pump.iob.timestamp': new Date(sample['lastMedicalDeviceDataUpdateServerTime']).toISOString(),
      'connect.calibStatus': 'LESS_THAN_NINE_HRS',
      'connect.conduitInRange': true,
      'connect.conduitMedicalDeviceInRange': true,
      'connect.conduitSensorInRange': true,
      'connect.sensorDurationHours': 137,
      'connect.sensorState': 'NORMAL',
      'connect.timeToNextCalibHours': 6,
      'device': 'connect://paradigm',
    }, function(val, key) {
      expect(_.get(pumpStatuses[0], key)).to.be(val);
    });
  });
});
