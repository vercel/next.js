var fs = require('fs')
var zlib = require('zlib')
var iltorb = require('iltorb')

module.exports = {
  // Return a stream of compressed file for each of the encodings you want
  //
  // The first listed encoding has the higher priority over others.
  //  In this case, it'll try to serve the `br` version if the browser supports it.
  //  Otherwise, it'll server gzipped version.
  compress: {
    br: function (filePath) {
      return fs.createReadStream(filePath).pipe(iltorb.compressStream())
    },
    gzip: function (filePath) {
      return fs.createReadStream(filePath).pipe(zlib.createGzip())
    }
  }
}
