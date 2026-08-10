// `lib` is only ever read via `.used`, so `exports.unused` in lib.js should drop.
const lib = require('./lib.js')

console.log(lib.used)
