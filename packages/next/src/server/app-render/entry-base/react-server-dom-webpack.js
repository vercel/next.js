if (
  process.env.NEXT_RUNTIME === 'nodejs' &&
  process.env.EXPERIMENTAL_NODE_STREAMS_SUPPORT === '1'
) {
  module.exports = require('./react-server-dom-webpack.node.js')
} else {
  module.exports = require('./react-server-dom-webpack.edge.js')
}
