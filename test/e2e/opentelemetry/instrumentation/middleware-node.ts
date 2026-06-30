import type { NextRequest, NextFetchEvent } from 'next/server'
import { NextResponse } from 'next/server'
import { trace } from '@opentelemetry/api'

export const config = {
  matcher: ['/behind-middleware', '/behind-middleware/:path*'],
  runtime: 'nodejs',
}

export async function middleware(
  request: NextRequest,
  event?: NextFetchEvent
): Promise<Response> {
  trace
    .getTracer('nextjs-example')
    .startActiveSpan('some-middleware-span', (span) => {})

  return NextResponse.next()
}
