if (
  process.env.NEXT_RUNTIME === 'nodejs' &&
  process.env.EXPERIMENTAL_NODE_STREAMS_SUPPORT === '1'
) {
  const mod = require('./react-server-dom-webpack.node.js');
  module.exports = {
    renderToStream: mod.renderToPipeableStream,
    decodeReply: mod.decodeReply,
    decodeAction: mod.decodeAction,
    decodeFormState: mod.decodeFormState,
    // decodeReplyFromBusboy: mod.decodeReplyFromBusboy,
  }
} else {
  const mod = require('./react-server-dom-webpack.edge.js');
  module.exports = {
    renderToStream: mod.renderToReadableStream,
    decodeReply: mod.decodeReply,
    decodeAction: mod.decodeAction,
    decodeFormState: mod.decodeFormState,
  }
}
