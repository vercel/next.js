import { NextResponse } from 'next/server'

export const config = {
  matcher: ['/app/rsc-fetch'],
}

export async function middleware() {
  const text = await (await fetch('https://example.com/middleware')).text()
  return NextResponse.next({
    headers: {
      'x-middleware-fetch': encodeURIComponent(text),
    },
  })
}
