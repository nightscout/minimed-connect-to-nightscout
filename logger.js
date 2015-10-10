/* jshint node: true */
"use strict";

module.exports.log = function(str) {
  if (process.env['CARELINK_VERBOSE']) {
    console.log(new Date() + ' ' + str);
  }
};
