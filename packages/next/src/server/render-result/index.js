if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.EXPERIMENTAL_NODE_STREAMS_SUPPORT === '1'
  ) {
    module.exports = require('next/dist/server/render-result/render-result.node.js')
  } else {
    module.exports = require('next/dist/server/render-result/render-result.edge.js')
  }
