// Inject a mock waitUntil via @next/request-context so we can verify
// that after() is called with the onRequestError promise.
// Pattern borrowed from test/e2e/app-dir/next-after-app (see
// utils/provided-request-context.js and the "uses waitUntil from
// request context if available" describe block in index.test.ts).
function injectRequestContext() {
  globalThis[Symbol.for('@next/request-context')] = {
    get() {
      return {
        waitUntil(promise) {
          console.log('[test] waitUntil called')
          promise.catch((err) => {
            console.error(err)
          })
        },
      }
    },
  }
}

export function register() {
  injectRequestContext()
}

// Return the fetch promise so the framework can register it with
// after()/waitUntil. Without the fix in create-error-handler.tsx,
// this promise is silently discarded.
export function onRequestError(err, request, context) {
  return fetch(`http://localhost:${process.env.PORT}/write-log`, {
    method: 'POST',
    body: JSON.stringify({
      message: err.message,
      request,
      context,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
