// TODO: Remove this file when Node.js 16 is not supported anymore

if (typeof fetch === 'undefined' && typeof globalThis.fetch === 'undefined') {
  function getFetchImpl() {
    return require('next/dist/compiled/undici')
  }

  function getRequestImpl() {
    const OriginalRequest = getFetchImpl().Request
    return class extends OriginalRequest {
      constructor(input: RequestInfo | URL, init: RequestInit) {
        super(input, init)
        this.next = init?.next
      }
    }
  }

  // Due to limitation of global configuration, we have to do this resolution at runtime
  globalThis.fetch = (...args: Parameters<typeof fetch>) => {
    const fetchImpl = getFetchImpl()

    // Undici does not support the `keepAlive` option,
    // instead we have to pass a custom dispatcher
    if (
      !global.__NEXT_HTTP_AGENT_OPTIONS?.keepAlive &&
      !global.__NEXT_UNDICI_AGENT_SET
    ) {
      global.__NEXT_UNDICI_AGENT_SET = true
      fetchImpl.setGlobalDispatcher(new fetchImpl.Agent({ pipelining: 0 }))
      console.warn(
        'Warning - Configuring `keepAlive: false` is deprecated. Use `{ headers: { connection: "close" } }` instead.'
      )
    }
    return fetchImpl.fetch(...args)
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
