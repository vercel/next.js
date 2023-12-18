const ERROR_MESSAGE =
  'Internal Error: do import legacy react-dom server APIs from "react-dom/server.browser", import from "react-dom/server" instead.'

function error() {
  throw new Error(ERROR_MESSAGE)
}

var b
if (process.env.NODE_ENV === 'production') {
  b = require('next/dist/compiled/react-dom/cjs/react-dom-server.edge.production.min.js')
} else {
  b = require('next/dist/compiled/react-dom/cjs/react-dom-server.edge.development.js')
}

exports.version = b.version
exports.renderToReadableStream = b.renderToReadableStream
exports.renderToNodeStream = b.renderToNodeStream
exports.renderToStaticNodeStream = b.renderToStaticNodeStream
exports.renderToString = error
exports.renderToStaticMarkup = error
if (b.resume) {
  exports.resume = b.resume
}
