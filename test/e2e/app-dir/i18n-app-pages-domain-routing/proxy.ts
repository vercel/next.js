import { NextRequest, NextResponse } from 'next/server'

const deploymentHost =
  process.env.NEXT_TEST_DEPLOYMENT_HOST ||
  (process.env.VERCEL === '1' ? process.env.VERCEL_URL : undefined)

const localeByHost = new Map([
  ['en.example.local', 'en-US'],
  ['nl.example.local', 'nl-NL'],
])

if (deploymentHost) {
  localeByHost.set(deploymentHost, 'nl-NL')
}

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':', 1)[0] || ''
  const locale = localeByHost.get(hostname) || 'en-US'

  return NextResponse.rewrite(new URL(`/${locale}/test`, request.url))
}

export const config = {
  matcher: '/test',
}
