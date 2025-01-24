import { renderToReadableStream } from "react-dom/server.edge"
import { streamToString } from "../../stream-utils/node-web-streams-helper"

export function createGetServerInsertedMetadata({ }) {
  return async function getServerInsertedMetadata({}) {

    const stream = await renderToReadableStream(
      <>
        <meta />
      </>
    )

    return streamToString(stream)
  }
}