exports.used = require('./direct-property-used-leaf.js').value
exports.unused = require('./direct-property-unused-leaf.js').value
// A side-effectful dependency must remain evaluated even though its outer export is unused.
exports.sideEffect = require('./direct-property-side-effect-leaf.js').value
