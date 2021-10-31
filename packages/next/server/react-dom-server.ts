const notImplemented = (method: string) => () => {
  throw new Error(`${method} is not implemented in the runtime.`)
}

let renderToReadableStream = notImplemented('renderToReadableStream') as any
let renderToStaticMarkup = notImplemented('renderToStaticMarkup') as any
let renderToString = notImplemented('renderToString') as any

if (process.browser) {
  const ReactDOMServer =
    process.env.NODE_ENV === 'production'
      ? require('react-dom/cjs/react-dom-server.browser.production.min.js')
      : require('react-dom/cjs/react-dom-server.browser.development.js')
  renderToReadableStream = ReactDOMServer.renderToStream
} else {
  const ReactDOMServer = require('react-dom/server')
  renderToStaticMarkup = ReactDOMServer.renderToStaticMarkup
  renderToString = ReactDOMServer.renderToString
}

export { renderToReadableStream, renderToStaticMarkup, renderToString }
