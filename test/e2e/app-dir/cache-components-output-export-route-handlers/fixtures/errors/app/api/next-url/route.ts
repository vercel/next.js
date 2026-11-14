import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return Response.json({ name: request.nextUrl.searchParams.get('name') })
}
