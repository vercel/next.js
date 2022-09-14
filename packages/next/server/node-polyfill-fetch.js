// Polyfill fetch() in the Node.js environment
if (!global.fetch) {
  // Due to limitation of global configuartion. we have to do this resolution at runtime
  const nodeFetch = require('next/dist/compiled/node-fetch')
  const undici = require('next/dist/compiled/undici')
  global.fetch = (...args) => {
    if (global.__NEXT_USE_UNDICI) {
      return undici.fetch(...args)
    } else {
      const agent = ({ protocol }) =>
        protocol === 'http:'
          ? global.__NEXT_HTTP_AGENT
          : global.__NEXT_HTTPS_AGENT

      if (!args[1]) {
        args[1] = { agent }
      } else if (!args[1].agent) {
        args[1].agent = agent
      }
      return nodeFetch(...args)
    }
  }

  Object.assign(global, {
    get Header() {
      return global.__NEXT_USE_UNDICI ? undici.Headers : nodeFetch.Headers
    },
    get Request() {
      return global.__NEXT_USE_UNDICI ? undici.Request : nodeFetch.Request
    },
    get Response() {
      return global.__NEXT_USE_UNDICI ? undici.Response : nodeFetch.Response
    },
  })
}
