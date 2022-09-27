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

  for (const [key, values] of Object.entries(nodeResponse.getHeaders())) {
    if (typeof values === 'string') {
      headers.set(key, [values])
    } else if (Array.isArray(values)) {
      headers.set(key, values)
    }
  }

  const keys =
    'raw' in stdResponse.headers
      ? Object.keys(stdResponse.headers.raw())
      : [...stdResponse.headers.keys()]

  for (const key of keys) {
    const values: string[] =
      'getAll' in stdResponse.headers
        ? // @ts-expect-error
          stdResponse.headers.getAll(key)
        : 'raw' in stdResponse.headers
        ? [...stdResponse.headers.raw()[key]]
        : [stdResponse.headers.get(key)!]
    const arr = headers.get(key) || []
    arr.push(...values)
    headers.set(key, arr)
  }

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
      nodeResponse.end(stdResponse.body)
    }
  } else {
    nodeResponse.end()
  }
}
