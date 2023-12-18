const ERROR_MESSAGE =
  'Internal Error: do import legacy react-dom server APIs from "react-dom/server.browser", import from "react-dom/server" instead.'

function error() {
  throw new Error(ERROR_MESSAGE)
}

// 'use strict';

var l
var s
if (process.env.NODE_ENV === 'production') {
  // l = require('next/dist/compiled/react-compiled/cjs/react-dom-server-legacy.browser.production.min.js');
  s = require('next/dist/compiled/react-compiled/cjs/react-dom-server.browser.production.min.js')
} else {
  // l = require('next/dist/compiled/react-compiled/cjs/react-dom-server-legacy.browser.development.js');
  s = require('next/dist/compiled/react-compiled/cjs/react-dom-server.browser.development.js')
}

exports.renderToString = error //l.renderToString;
exports.renderToStaticMarkup = error //l.renderToStaticMarkup;
exports.renderToNodeStream = error //l.renderToNodeStream;
exports.renderToStaticNodeStream = error //l.renderToStaticNodeStream;

exports.version = s.version
exports.renderToReadableStream = s.renderToReadableStream
if (s.resume) {
  exports.resume = s.resume
}
