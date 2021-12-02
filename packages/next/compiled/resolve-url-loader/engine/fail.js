/*
 * MIT License http://opensource.org/licenses/MIT
 * Author: Ben Holloway @bholloway
 */
'use strict';

/**
 * Process the given CSS content into reworked CSS content.
 */
function process() {
  return new Promise(function (_, reject) {
    setTimeout(function () {
      reject(new Error('This "engine" is designed to fail, for testing purposes only'));
    }, 100);
  });
}

module.exports = process;
