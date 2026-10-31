import { ClientRequestInterceptor } from 'next/dist/compiled/@mswjs/interceptors/ClientRequest'
import { handleProxyFetch } from './fetch'

type Fetch = typeof fetch

export function interceptHttpGet(originalFetch: Fetch): () => void {
  const clientRequestInterceptor = new ClientRequestInterceptor()
  clientRequestInterceptor.on('request', async ({ request, controller }) => {
    if (request.headers.get('next-test-internal') === '1') {
      // A request that's part of the test proxy protocol itself, sent by
      // `handleProxyFetch` from within this listener. Not responding lets the
      // interceptor perform it against the real server. Handling it here
      // instead would recurse indefinitely.
      return
    }
    const response = await handleProxyFetch(originalFetch, request)
    // Native passthrough preserves compressed bytes, headers, and redirects.
    // Fetch would decode the body while retaining the upstream headers.
    if (response !== null) {
      controller.respondWith(response)
    }
  })
  clientRequestInterceptor.apply()

  // Cleanup.
  return () => {
    clientRequestInterceptor.dispose()
  }
}
