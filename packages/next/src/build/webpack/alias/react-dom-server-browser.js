const ERROR_MESSAGE =
  'Internal Error: do import legacy react-dom server APIs from "react-dom/server.browser", import from "react-dom/server" instead.'

function error() {
  throw new Error(ERROR_MESSAGE)
}

const prefix = `next/dist/compiled/react-dom/cjs/react-dom${process.env.__NEXT_EXPERIMENTAL_REACT} ? '-experimental' : ''}`

var s
if (process.env.NODE_ENV === 'production') {
  s = require(prefix + '/cjs/react-dom-server.browser.production.min.js')
} else {
  s = require(prefix + '/cjs/react-dom-server.browser.development.js')
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
