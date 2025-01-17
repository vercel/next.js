import { ClientRequestInterceptor } from 'next/dist/compiled/@mswjs/interceptors/ClientRequest'
import { handleFetch } from './fetch'

type Fetch = typeof fetch

export function interceptHttpGet(originalFetch: Fetch): () => void {
  const clientRequestInterceptor = new ClientRequestInterceptor()
  clientRequestInterceptor.on('request', async ({ request }) => {
    const response = await handleFetch(originalFetch, request)
    request.respondWith(response)
  })
  clientRequestInterceptor.apply()

  // Cleanup.
  return () => {
    clientRequestInterceptor.dispose()
  }
}
