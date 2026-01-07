import { NextResponse } from 'next/server'

/**
 * Middleware that forwards request headers including non-ASCII values.
 * This simulates how CDNs might add headers with non-ASCII characters
 * (e.g., x-city: Montréal).
 *
 * The issue (#85631) is that when middleware forwards headers containing
 * non-ASCII characters, they get passed through x-middleware-request-* headers
 * which must be ASCII-safe.
 *
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  // This is the typical middleware pattern - create a new Headers object
  // to allow modifications
  const headers = new Headers(request.headers)

  // Add a marker header to prove middleware ran
  headers.set('x-middleware-ran', 'true')

  return NextResponse.next({
    request: {
      headers,
    },
  })
}
