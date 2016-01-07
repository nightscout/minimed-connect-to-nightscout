/* jshint node: true */
"use strict";

// Returns a stateful filter which remembers the time of the last-seen entry to
// prevent uploading duplicates.
function makeRecencyFilter(timeFn) {
  var lastTime = 0;

  return function(items) {
    var out = [];
    items.forEach(function(item) {
      if (timeFn(item) > lastTime) {
        out.push(item);
      }
    });
    out.forEach(function(item) {
      lastTime = Math.max(lastTime, timeFn(item));
    });

    return out;
  };
}

module.exports.makeRecencyFilter = makeRecencyFilter;
