// Mirrors how `sqlite3` loads its binary, which is the shape both bundlers
// special-case: a single `require('bindings')('<name>.node')` call.
module.exports = require('bindings')('native_addon.node')
