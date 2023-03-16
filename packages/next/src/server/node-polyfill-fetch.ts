// TODO: Remove use of `any` type.
// Polyfill fetch() in the Node.js environment

if (!(global as any).fetch) {
  const impl: { [K: string]: any } = {}
  function getFetchImpl() {
    return (global as any).__NEXT_USE_UNDICI
      ? require('next/dist/compiled/undici')
      : require('next/dist/compiled/node-fetch')
  }

  function getRequestImpl() {
    if (impl.Request) return impl.Request
    const OriginRequest = getFetchImpl().Request
    return (impl.Request = class Request extends OriginRequest {
      constructor(input: any, init: any) {
        super(input, init)
        this.next = init?.next
      }
    })
  }

  // Due to limitation of global configuration, we have to do this resolution at runtime
  impl.fetch = (...args: any[]) => {
    const fetchImpl = getFetchImpl()

    if ((global as any).__NEXT_USE_UNDICI) {
      // Undici does not support the `keepAlive` option,
      // instead we have to pass a custom dispatcher
      if (
        !(global as any).__NEXT_HTTP_AGENT_OPTIONS?.keepAlive &&
        !(global as any).__NEXT_UNDICI_AGENT_SET
      ) {
        ;(global as any).__NEXT_UNDICI_AGENT_SET = true
        fetchImpl.setGlobalDispatcher(new fetchImpl.Agent({ pipelining: 0 }))
      }
      return fetchImpl.fetch(...args)
    }
    const agent = ({ protocol }: any) =>
      protocol === 'http:'
        ? (global as any).__NEXT_HTTP_AGENT
        : (global as any).__NEXT_HTTPS_AGENT

    if (!args[1]) {
      args[1] = { agent }
    } else if (!args[1].agent) {
      args[1].agent = agent
    }

    return fetchImpl(...args)
  }

  Object.defineProperties(global, {
    fetch: {
      set(fetch) {
        impl.fetch = fetch
      },
      get() {
        return impl.fetch
      },
    },
    Headers: {
      set(Headers) {
        impl.Headers = Headers
      },
      get() {
        return impl.Headers
      },
    },
    Request: {
      set(Request) {
        impl.Request = Request
      },
      get() {
        return getRequestImpl().Request
      },
    },
    Response: {
      set(Response) {
        impl.Response = Response
      },
      get() {
        return impl.Response
      },
    },
  })
}
