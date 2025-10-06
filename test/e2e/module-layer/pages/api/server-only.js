import 'server-only'
import * as ReactDomServer from 'react-dom/server'
import * as React from 'react'

export default async (_req, res) => {
  return res.json({
    React: Object.keys(Object(React)),
    ReactDomServer: Object.keys(Object(ReactDomServer)),
  })
}
