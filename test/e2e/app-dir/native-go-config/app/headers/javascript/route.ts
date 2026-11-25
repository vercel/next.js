import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return new Response(
    request.headers.get('x-resource') === 'private' ||
    request.cookies.get('resource')?.value === 'private'
      ? 'secret'
      : 'public'
  )
}
