import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get('resource') ?? 'private'
  return Response.json({
    resource,
    secret: resource !== 'public',
    repeated: request.nextUrl.searchParams.getAll('value').length,
  })
}
