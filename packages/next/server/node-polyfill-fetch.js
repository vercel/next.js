import fetch, {
  Headers,
  Request,
  Response as NodeFetchResponse,
} from 'next/dist/compiled/node-fetch'
import { bodyStreamToNodeStream } from './body-streams'

// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  const agent = ({ protocol }) =>
    protocol === 'http:' ? global.__NEXT_HTTP_AGENT : global.__NEXT_HTTPS_AGENT
  const fetchWithAgent = (url, opts, ...rest) => {
    if (!opts) {
      opts = { agent }
    } else if (!opts.agent) {
      opts.agent = agent
    }
    return fetch(url, opts, ...rest)
  }

  // This enables node-fetch to use `ReadableStream` and stream data
  // with web streams and not just Node.js streams.
  class Response extends NodeFetchResponse {
    constructor(body, opts) {
      if (body && typeof body === 'object' && 'getReader' in body) {
        body = bodyStreamToNodeStream(body)
      }
      super(body, opts)
    }
  }

  global.fetch = fetchWithAgent
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}
