/**
 * App Route handler that:
 * 1. Reads request headers (tests NextRequest header conversion)
 * 2. Sets response headers with non-ASCII values (tests outgoing header handling)
 */
export async function GET(request) {
  // Read incoming request headers
  const requestHeaders = {}
  for (const [key, value] of request.headers.entries()) {
    if (key.startsWith('x-')) {
      requestHeaders[key] = value
    }
  }

  // Create response with non-ASCII header values
  const response = new Response(JSON.stringify(requestHeaders), {
    headers: {
      'Content-Type': 'application/json',
      // Set non-ASCII response headers to verify they work
      'x-response-city': 'Montréal',
      'x-response-country': 'Österreich',
    },
  })

  return response
}
