// Only `used` is destructured from the require result, so `exports.unused` in
// lib.js should be dropped.
const { used } = require('./lib.js')

console.log(used)
