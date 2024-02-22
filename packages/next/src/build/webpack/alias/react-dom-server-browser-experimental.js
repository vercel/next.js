var l, s
if (process.env.NODE_ENV === 'production') {
  l = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server-legacy.browser.production.min.js')
  s = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.browser.production.min.js')
} else {
  l = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server-legacy.browser.development.js')
  s = require('next/dist/compiled/react-dom-experimental/cjs/react-dom-server.browser.development.js')
}

exports.version = l.version
exports.renderToString = l.renderToString
exports.renderToStaticMarkup = l.renderToStaticMarkup
exports.renderToNodeStream = l.renderToNodeStream
exports.renderToStaticNodeStream = l.renderToStaticNodeStream
exports.renderToReadableStream = s.renderToReadableStream
if (s.resume) {
  exports.resume = s.resume
}
