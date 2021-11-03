let ReactDOMServer: typeof import('react-dom/server')

if (process.browser) {
  if (process.env.NODE_ENV === 'production') {
    ReactDOMServer = require('react-dom/cjs/react-dom-server.browser.production.min')
  } else {
    ReactDOMServer = require('react-dom/cjs/react-dom-server.browser.development')
  }
} else {
  ReactDOMServer = require('react-dom/server')
}

export default ReactDOMServer
