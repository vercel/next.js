import { NextResponse, type NextRequest } from 'next/server'

declare global {
  var copiedHeaders: Headers[]
}

export function proxy(request: NextRequest) {
  // A copy that the test expects to find. Without it, the test would also
  // pass if the copies of this bundle were no longer recorded.
  const control = new Headers()
  new Headers(control)

  return NextResponse.json({
    copiedHeaders: globalThis.copiedHeaders.map((headers) =>
      headers === request.headers
        ? 'request'
        : headers === control
          ? 'control'
          : 'other'
    ),
    forwarded: request.headers.get('x-forwarded-for'),
  })
}
