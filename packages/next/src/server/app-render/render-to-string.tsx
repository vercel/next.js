import { streamToString } from '../stream-utils/node-web-streams-helper'

export async function renderToString({
  renderToReadableStream,
  element,
}: {
  // `renderToReadableStream()` method could come from different react-dom/server implementations
  // such as `react-dom/server.edge` or `react-dom/server.node`, etc.
  renderToReadableStream: typeof import('react-dom/server.edge').renderToReadableStream
  element: React.ReactElement
}): Promise<string> {
  const renderStream = await renderToReadableStream(element)
  await renderStream.allReady
  return streamToString(renderStream)
}
