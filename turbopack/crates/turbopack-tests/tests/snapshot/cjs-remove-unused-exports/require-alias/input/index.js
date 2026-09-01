// `require` is aliased, so the require-usage analysis can't recognize the call.
// No usage is recorded for it, which must fail open: lib.js keeps *all* its
// exports (including `unused`) rather than being narrowed to just `.used`.
const myRequire = require
console.log(myRequire('./lib.js').used)
