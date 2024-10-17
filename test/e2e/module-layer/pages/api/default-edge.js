import * as ReactDomServer from 'react-dom/server'
import * as React from 'react'

export default async (_req) => {
  return Response.json({
    React: Object.keys(Object(React)),
    ReactDomServer: Object.keys(Object(ReactDomServer)),
  })
}

export const runtime = 'edge'
