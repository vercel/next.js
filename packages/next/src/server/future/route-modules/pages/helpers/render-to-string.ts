import ReactDOMServer from 'react-dom/server.browser'
import { streamToString } from '../../../../node-web-streams-helper'

export async function renderToString(
  element: React.ReactElement
): Promise<string> {
  const renderStream = await ReactDOMServer.renderToReadableStream(element)
  await renderStream.allReady
  return streamToString(renderStream)
}
