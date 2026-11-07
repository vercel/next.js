import { NextResponse, type NextRequest } from 'next/server'

declare global {
  var copiedHeaders: WeakSet<Headers>
}

export function proxy(request: NextRequest) {
  return NextResponse.json({
    requestHeadersCopied: globalThis.copiedHeaders.has(request.headers),
    forwarded: request.headers.get('x-forwarded-for'),
  })
}
