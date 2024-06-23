if (
  process.env.NEXT_RUNTIME === 'nodejs' &&
  process.env.EXPERIMENTAL_NODE_STREAMS_SUPPORT === '1'
) {
  module.exports = require('next/dist/server/app-render/static/renderers.node.js')
} else {
  module.exports = require('next/dist/server/app-render/static/renderers.edge.js')
}
