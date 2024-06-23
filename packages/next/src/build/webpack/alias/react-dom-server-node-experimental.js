var b
if (process.env.NODE_ENV === 'production') {
  b = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.node.production.js')
} else {
  b = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.node.development.js')
}

exports.version = b.version
exports.renderToPipeableStream = b.renderToPipeableStream
exports.prerenderToNodeStream = b.prerenderToNodeStream
if (b.resume) {
  exports.resume = b.resume
}
