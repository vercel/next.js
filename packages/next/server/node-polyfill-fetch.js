// Polyfill fetch() in the Node.js environment

if (!global.fetch) {
  function getFetchImpl() {
    return global.__NEXT_USE_UNDICI
      ? require('next/dist/compiled/undici')
      : require('next/dist/compiled/node-fetch')
  }
  // Due to limitation of global configuartion, we have to do this resolution at runtime
  global.fetch = (...args) => {
    const fetchImpl = getFetchImpl()

    if (global.__NEXT_USE_UNDICI) {
      return fetchImpl.fetch(...args)
    }
    const agent = ({ protocol }) =>
      protocol === 'http:'
        ? global.__NEXT_HTTP_AGENT
        : global.__NEXT_HTTPS_AGENT

    if (!args[1]) {
      args[1] = { agent }
    } else if (!args[1].agent) {
      args[1].agent = agent
    }

    return fetchImpl(...args)
  }

  Object.defineProperties(global, {
    Headers: {
      get() {
        return getFetchImpl().Headers
      },
    },
    Request: {
      get() {
        return getFetchImpl().Request
      },
    },
    Response: {
      get() {
        return getFetchImpl().Response
      },
    },
  })
}
