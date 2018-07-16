/* jshint node: true */
/* globals describe, it */
"use strict";

var _ = require('lodash'),
  expect = require('expect.js');

var makeRecencyFilter = require('../filter.js').makeRecencyFilter;

describe('makeRecencyFilter()', function() {
  it('should return a stateful filter which discards items older than the most recent one seen', function() {
    function sgv(date) {
      return {type: 'sgv', someDateKey: date};
    }

    var filter = makeRecencyFilter(function(item) {
      return item['someDateKey'];
    });

    expect(filter([2, 3, 4].map(sgv))).to.have.length(3);

    expect(filter([2, 3, 4].map(sgv))).to.have.length(0);

    var filtered = filter([2, 3, 4, 8, 6, 7, 5].map(sgv));
    expect(filtered).to.have.length(4);
    [5, 6, 7, 8].forEach(function(val) {
      expect(_.map(filtered, 'someDateKey')).to.contain(val);
    });
  });
});
