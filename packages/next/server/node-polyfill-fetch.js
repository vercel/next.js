let fetch, Headers, Request, Response

if (process.env.NEXT_USE_UNDICI) {
  const undici = require('next/dist/compiled/undici')
  fetch = undici.fetch
  Headers = undici.Headers
  Request = undici.Request
  Response = undici.Response
} else {
  const nodeFetch = require('next/dist/compiled/node-fetch')
  fetch = nodeFetch.fetch
  Headers = nodeFetch.Headers
  Request = nodeFetch.Request
  Response = nodeFetch.Response
}

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
