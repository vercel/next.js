/**
 * App Route handler that reads request headers (tests NextRequest header conversion)
 */
export async function GET(request) {
  // Read incoming request headers
  const requestHeaders = {}
  for (const [key, value] of request.headers.entries()) {
    if (key.startsWith('x-')) {
      requestHeaders[key] = value
    }
  }

  return new Response(JSON.stringify(requestHeaders), {
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
