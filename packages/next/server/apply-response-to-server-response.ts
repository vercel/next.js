import { ServerResponse } from 'http'
import { bodyStreamToNodeStream } from './body-streams'
import type { Response as NodeFetchResponse } from 'node-fetch'

export function applyResponseToServerResponse(
  stdResponse: Response | NodeFetchResponse,
  nodeResponse: ServerResponse
) {
  nodeResponse.statusCode = stdResponse.status
  nodeResponse.statusMessage = stdResponse.statusText

  const headers = new Map<string, string[]>()

  stdResponse.headers.forEach((value, key) => {
    const arr = headers.get(key) || []
    arr.push(value)
    headers.set(key, arr)
  })

  for (const [key, values] of headers) {
    nodeResponse.setHeader(key, values)
  }

  if (stdResponse.body) {
    if ('getReader' in stdResponse.body) {
      // TODO(schniz): not sure that we always need to stream
      bodyStreamToNodeStream(stdResponse.body).pipe(nodeResponse)
    } else if ('pipe' in stdResponse.body) {
      stdResponse.body.pipe(nodeResponse)
    } else {
      console.log(stdResponse.body)
      nodeResponse.end(stdResponse.body)
    }
  } else {
    nodeResponse.end()
  }
}
