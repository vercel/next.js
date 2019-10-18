import React from 'react'

// We don't want to send 'react-dom/server' to the client
let ReactDOMServer
if (typeof window === 'undefined') {
  ReactDOMServer = require('react-dom/server')
}

export default function Noscript ({ children }) {
  if (!ReactDOMServer) {
    return null
  }
  const staticMarkup = ReactDOMServer.renderToStaticMarkup(children)
  return <noscript dangerouslySetInnerHTML={{ __html: staticMarkup }} />
}
