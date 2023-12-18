const ERROR_MESSAGE =
  'Internal Error: do not use legacy react-dom/server APIs. If you encountered this error, please open an issue on the Next.js repo.'

function error() {
  throw new Error(ERROR_MESSAGE)
}

var s
if (process.env.NODE_ENV === 'production') {
  s = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.browser.production.min.js')
} else {
  s = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.browser.development.js')
}

exports.renderToString = error
exports.renderToStaticMarkup = error
exports.renderToNodeStream = error
exports.renderToStaticNodeStream = error

exports.version = s.version
exports.renderToReadableStream = s.renderToReadableStream
if (s.resume) {
  exports.resume = s.resume
}
