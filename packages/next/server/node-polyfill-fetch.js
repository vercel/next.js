// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  if (global.__NEXT_USE_UNDICI) {
    const undici = require('next/dist/compiled/undici')
    global.fetch = undici.fetch
    global.Headers = undici.Headers
    global.Request = undici.Request
    global.Response = undici.Response
  } else {
    const nodeFetch = require('next/dist/compiled/node-fetch')
    const fetch = nodeFetch
    global.Headers = nodeFetch.Headers
    global.Request = nodeFetch.Request
    global.Response = nodeFetch.Response

    const agent = ({ protocol }) =>
      protocol === 'http:'
        ? global.__NEXT_HTTP_AGENT
        : global.__NEXT_HTTPS_AGENT
    const fetchWithAgent = (url, opts, ...rest) => {
      if (!opts) {
        opts = { agent }
      } else if (!opts.agent) {
        opts.agent = agent
      }
      return fetch(url, opts, ...rest)
    }
    global.fetch = fetchWithAgent
  }
}
