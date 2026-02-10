// Compile-time switcher for debug-channel-server.
// This file must stay as plain .js (not .ts) so that the CJS
// module.exports = require(...) pattern is preserved verbatim for
// webpack DCE to work. TypeScript would transform it during compilation.
if (process.env.NEXT_RUNTIME === 'edge') {
  module.exports = require('./debug-channel-server.web')
} else if (process.env.__NEXT_USE_NODE_STREAMS) {
  module.exports = require('./debug-channel-server.node')
} else {
  module.exports = require('./debug-channel-server.web')
}
