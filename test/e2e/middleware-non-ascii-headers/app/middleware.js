import { NextResponse } from 'next/server'

/**
 * Middleware that forwards request headers including non-ASCII values.
 * This simulates how Cloudflare or other CDNs might add headers with
 * non-ASCII characters (e.g., cf-ipcity: Montréal).
 *
 * The issue (#85631) is that when middleware forwards headers containing
 * non-ASCII characters, they get passed through x-middleware-request-* headers
 * which must be ASCII-safe. This causes errors on Vercel's runtime.
 *
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
  // Simply forward all existing headers through NextResponse.next()
  // This is the common pattern that triggers the issue when incoming
  // headers contain non-ASCII values (e.g., from Cloudflare geolocation)
  const headers = new Headers(request.headers)

  // Add a marker header to prove middleware ran
  headers.set('x-middleware-ran', 'true')

  return NextResponse.next({
    request: {
      headers,
    },
  })
}
