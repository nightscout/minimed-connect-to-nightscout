/* jshint node: true */
"use strict";

module.exports.log = function(str) {
  if (process.env['MINIMED_CONNECT_VERBOSE']) {
    console.log(new Date() + ' ' + str);
  }
};
