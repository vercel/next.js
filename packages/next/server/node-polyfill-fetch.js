// Polyfill fetch() in the Node.js environment

if (!global.fetch) {
  function getFetchImpl() {
    return global.__NEXT_USE_UNDICI
      ? require('next/dist/compiled/undici')
      : require('next/dist/compiled/node-fetch')
  }

  function getRequestImpl() {
    const OriginRequest = getFetchImpl().Request
    return class Request extends OriginRequest {
      constructor(input, init) {
        super(input, init)
        this.next = init?.next
      }
    }
  }

  // Due to limitation of global configuration, we have to do this resolution at runtime
  global.fetch = (...args) => {
    const fetchImpl = getFetchImpl()

    if (global.__NEXT_USE_UNDICI) {
      // Undici does not support the `keepAlive` option,
      // instead we have to pass a custom dispatcher
      if (
        !global.__NEXT_HTTP_AGENT_OPTIONS?.keepAlive &&
        !global.__NEXT_UNDICI_AGENT_SET
      ) {
        global.__NEXT_UNDICI_AGENT_SET = true
        fetchImpl.setGlobalDispatcher(new fetchImpl.Agent({ pipelining: 0 }))
      }
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
        return getRequestImpl()
      },
    },
    Response: {
      get() {
        return getFetchImpl().Response
      },
    },
  })
}
