/* jshint node: true */
"use strict";

module.exports = (function() {
  var verbose_ = false;

  return {
    setVerbose: function(v) {
      verbose_ = v;
    },
    log: function(str) {
      if(verbose_) {
        console.log(new Date() + ' ' + str);
      }
    }
  };
})();
