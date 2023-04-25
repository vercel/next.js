import { streamToString } from '../node-web-streams-helper'
import { AppRenderSpan } from '../lib/trace/constants'
import { getTracer } from '../lib/trace/tracer'

export async function renderToString(element: React.ReactElement) {
  return getTracer().trace(AppRenderSpan.renderToString, async () => {
    const ReactDOMServer =
      require('react-dom/server.browser') as typeof import('react-dom/server.browser')
    const renderStream = await ReactDOMServer.renderToReadableStream(element)
    await renderStream.allReady
    return streamToString(renderStream)
  })
}
