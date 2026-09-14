import { NextResponse } from 'next/server'

export function proxy() {
  return NextResponse.next({
    headers: {
      'My-Custom-Header': `instrumentationFinished=${(globalThis as any).instrumentationFinished}`,
    },
  })
}

export const config = {
  matcher: '/',
}
