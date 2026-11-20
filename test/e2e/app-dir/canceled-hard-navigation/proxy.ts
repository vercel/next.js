import { NextRequest } from 'next/server'

// While the cookie is set, answer the document request for /b with a 204.
// Browsers abandon a navigation that gets a 204, leaving the current document
// in place. Router (RSC) requests are let through.
export default function proxy(req: NextRequest) {
  if (
    req.nextUrl.pathname === '/b' &&
    req.cookies.has('cancel-document-request') &&
    !req.headers.has('rsc')
  ) {
    return new Response(null, { status: 204 })
  }
}
