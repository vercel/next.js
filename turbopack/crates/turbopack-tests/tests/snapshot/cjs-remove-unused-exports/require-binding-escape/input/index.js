const lib = require('./lib.js')

console.log(lib.used)

// `lib` also escapes wholesale, so the whole namespace is observable and
// nothing may be dropped.
globalThis.leaked = lib
