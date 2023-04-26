import React from 'next/dist/compiled/react'
import ReactDOMServer from 'next/dist/compiled/react-dom/server.browser'
import { streamToString } from '../node-web-streams-helper'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'

export async function renderToString(element: React.ReactElement) {
  return getTracer().trace(AppRenderSpan.renderToString, async () => {
    const renderStream = await ReactDOMServer.renderToReadableStream(element)
    await renderStream.allReady
    return streamToString(renderStream)
  })
}
