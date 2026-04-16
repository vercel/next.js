// Simulates what @vercel/otel does: wrap globalThis.fetch during the
// instrumentation hook to inject trace-context headers into outgoing requests.
// We use a probe URL to verify the wrapper is still active after HMR.
const nativeFetch = globalThis.fetch

globalThis.fetch = async function instrumentedFetch(
  resource: URL | RequestInfo,
  options?: RequestInit
) {
  const request = new Request(resource, options)

  if (request.url === 'http://fake.url/instrumentation-probe') {
    return new Response('instrumentation-active')
  }

  return nativeFetch(request)
}
