if (
  process.env.NEXT_RUNTIME === 'nodejs' &&
  process.env.EXPERIMENTAL_NODE_STREAMS_SUPPORT === '1'
) {
  module.exports = require('./use-flight-response.node.js')
} else {
  module.exports = require('./use-flight-response.edge.js')
}
