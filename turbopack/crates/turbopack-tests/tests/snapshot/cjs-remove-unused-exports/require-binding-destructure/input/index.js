// `lib` is only read through an object pattern, so `exports.unused` in lib.js
// should drop just as it does for `const { used } = require('./lib.js')`.
const lib = require('./lib.js')
const { used } = lib

console.log(used)
