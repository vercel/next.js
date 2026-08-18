// The result of this bare require is discarded, and the target is side-effect
// free, so the `require(...)` call is replaced with a `0` placeholder (later
// removed by minification) instead of loading the module.
require('./pure.js')

console.log('kept')
