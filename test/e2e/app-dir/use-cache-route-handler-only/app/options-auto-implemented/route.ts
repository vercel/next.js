async function getCachedBody() {
  'use cache'

  return 'hello'
}

// Only GET is defined, so OPTIONS is auto-implemented with a 204 response.
export async function GET() {
  return new Response(await getCachedBody())
}
