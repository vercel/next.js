import fetch, {
  Headers,
  Request,
  Response,
} from 'next/dist/compiled/node-fetch'

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
  global.fetch = fetchWithAgent
  global.Headers = Headers
  global.Request = Request
  global.Response = Response
}
