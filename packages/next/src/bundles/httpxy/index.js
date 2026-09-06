// httpxy only ships an ESM entry point. Re-export it through this CJS entry
// so ncc emits a CommonJS bundle that the server runtime can `require()`.
module.exports = require('httpxy')
