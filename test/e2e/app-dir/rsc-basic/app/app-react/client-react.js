'use client'

import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMServer from 'react-dom/server.edge'
import { renderToStaticMarkup } from 'react-dom/server'

export default function ClientReact() {
  const markup = renderToStaticMarkup(
    <div className="react-static-markup">{'React Static Markup'}</div>
  )

  return (
    <div>
      <p id="client-react">{'React.version=' + React.version}</p>
      <p id="client-react-dom">{'ReactDOM.version=' + ReactDOM.version}</p>
      <p id="client-react-dom-server">
        {'ReactDOMServer.version=' + ReactDOMServer.version}
      </p>
      <p id="markup">{markup}</p>
    </div>
  )
}
