// Compile-time switcher for stream operations.
// This file must stay as plain .js (not .ts) so that the CJS
// module.exports = require(...) pattern is preserved verbatim for
// webpack DCE to work.
if (process.env.__NEXT_USE_NODE_STREAMS) {
  module.exports = require('./stream-ops.node')
} else {
  module.exports = require('./stream-ops.web')
}
