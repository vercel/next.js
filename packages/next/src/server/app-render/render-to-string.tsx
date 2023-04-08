import type { ReactElement } from 'react'

import { streamToString } from '../node-web-streams-helper'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'

let ReactDOMServer: typeof import('next/dist/compiled/react-dom/server.browser')

if (process.env.NEXT_PREBUNDLED_REACT === 'experimental') {
  ReactDOMServer = require('next/dist/compiled/react-dom-experimental/server.browser')
} else {
  ReactDOMServer = require('next/dist/compiled/react-dom/server.browser')
}

export async function renderToString(element: ReactElement) {
  return getTracer().trace(AppRenderSpan.renderToString, async () => {
    const renderStream = await ReactDOMServer.renderToReadableStream(element)
    await renderStream.allReady
    return streamToString(renderStream)
  })
}
