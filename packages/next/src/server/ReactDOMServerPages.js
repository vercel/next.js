let ReactDOMServer

try {
  // TODO: Use Node.js build unless we're in an Edge runtime.
  ReactDOMServer = require('react-dom/server.edge')
} catch (error) {
  if (
    error.code !== 'MODULE_NOT_FOUND' &&
    error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  ) {
    throw error
  }
  // In React versions without react-dom/server.edge, the browser build works in Node.js.
  // The Node.js build does not support renderToReadableStream.
  ReactDOMServer = require('react-dom/server.browser')
}

module.exports = ReactDOMServer
