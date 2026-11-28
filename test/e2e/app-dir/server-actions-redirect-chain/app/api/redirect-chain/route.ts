import { NextResponse } from 'next/server'

export async function GET() {
  // Simulate a route that redirects externally (e.g., OAuth flow).
  // Without redirect: 'manual', createRedirectRenderResult would follow
  // this redirect server-side, causing latency or errors.
  return NextResponse.redirect('https://example.com/external-redirect')
}
