import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.searchParams.has('load')) {
    return NextResponse.json({ value: 'idle' })
  }

  const { value } = await import('./lib/lazy-proxy-target')
  return NextResponse.json({ value })
}

export const config = { matcher: '/lazy-proxy-probe' }
