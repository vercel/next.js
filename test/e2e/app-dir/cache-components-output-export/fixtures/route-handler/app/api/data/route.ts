async function getData() {
  'use cache'
  return { value: 'from-route-handler' }
}

// Data access is factored into a cached function — the `Response` itself can't
// be cached, but the handler resolves with build-time data, so it exports.
export async function GET() {
  return Response.json(await getData())
}
