let ReactDOMServer

try {
  ReactDOMServer = require('react-dom/server.edge')
} catch (error) {
  if (
    // TODO: copilot suggestion. Does this code actually exist?
    error.code !== 'MODULE_NOT_FOUND' &&
    // TODO: actually encountered that
    error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
  ) {
    throw error
  }
  // TOOD: Ensure App Router does not bundle this
  ReactDOMServer = require('react-dom/server.browser')
}

module.exports = ReactDOMServer
