// TODO: Remove use of `any` type.
// Polyfill fetch() in the Node.js environment

if (!(global as any).fetch) {
  function getFetchImpl() {
    return require('next/dist/compiled/undici')
  }

  function getRequestImpl() {
    const OriginRequest = getFetchImpl().Request
    return class Request extends OriginRequest {
      constructor(input: any, init: any) {
        super(input, init)
        this.next = init?.next
      }
    }
  }

  // Due to limitation of global configuration, we have to do this resolution at runtime
  ;(global as any).fetch = (...args: any[]) => {
    const fetchImpl = getFetchImpl()
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
