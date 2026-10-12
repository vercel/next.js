// Only `.used` is read off the require result, so `exports.unused` in lib.js
// should be dropped.
console.log(require('./lib.js').used)
