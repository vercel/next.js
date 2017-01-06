var zlib = require('zlib')
var iltorb = require('iltorb')

module.exports = {
  // Returns a map of compression streams for the types of encodings you want to support
  // Here's a list of common encoding types: https://goo.gl/ke7zOK

  // The first listed encoding has the higher priority over others.
  //  In this case, first it'll try to serve the `br` version if the browser supports it.
  //  Otherwise, it'll serve the gzipped version.
  compress: {
    br: function () {
      return iltorb.compressStream()
    },
    gzip: function () {
      // You can also return a promise which resolve a compression stream
      return new Promise(function (resolve) {
        resolve(zlib.createGzip())
      })
    }
  }
}
