const ERROR_MESSAGE =
  'Internal Error: do not use legacy react-dom/server APIs. If you encountered this error, please open an issue on the Next.js repo.'

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
