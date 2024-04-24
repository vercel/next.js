const l = require('next/dist/compiled/react-dom-experimental/server.browser')
const s = require('next/dist/compiled/react-dom-experimental/server.browser')

exports.version = l.version
exports.renderToString = l.renderToString
exports.renderToStaticMarkup = l.renderToStaticMarkup
exports.renderToNodeStream = l.renderToNodeStream
exports.renderToStaticNodeStream = l.renderToStaticNodeStream
exports.renderToReadableStream = s.renderToReadableStream
if (s.resume) {
  exports.resume = s.resume
}
