export function register() {
  globalThis[Symbol.for('@next/request-context')] = {
    get() {
      return {
        waitUntil(promise) {
          console.log('RequestContext::waitUntil')
          promise.catch((err) => {
            console.error(err)
          })
        },
      }
    },
  }
}
