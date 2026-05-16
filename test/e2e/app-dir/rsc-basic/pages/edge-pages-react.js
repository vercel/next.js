import React from 'react'
import ReactDOM from 'react-dom'
import ReactDOMServer from 'react-dom/server'

export default function Page() {
  return (
    <div>
      <p id="react">{'React.version=' + React.version}</p>
      <p id="react-dom">{'ReactDOM.version=' + ReactDOM.version}</p>
      <p id="react-dom-server">
        {'ReactDOMServer.version=' + ReactDOMServer.version}
      </p>
    </div>
  )
}

export const runtime = 'experimental-edge'
