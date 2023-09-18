'use client'

import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMServer from 'react-dom/server.edge'

export default function ClientReact() {
  return (
    <div>
      <p id="client-react">{'React.version=' + React.version}</p>
      <p id="client-react-dom">{'ReactDOM.version=' + ReactDOM.version}</p>
      <p id="client-react-dom-server">
        {'ReactDOMServer.version=' + ReactDOMServer.version}
      </p>
    </div>
  )
}
