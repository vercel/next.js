import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const path = decodeURIComponent(request.nextUrl.pathname)
  if (
    path === '/native-security/private' ||
    ((path.startsWith('/native-security/resource/') ||
      path.startsWith('/native-security/single/')) &&
      (path.endsWith('/private') || path.endsWith('/literal.rsc')))
  ) {
    return new NextResponse('protected', { status: 403 })
  }
  if (
    path === '/native-security/query' &&
    request.nextUrl.searchParams.get('resource') !== 'public'
  ) {
    return new NextResponse('protected query', { status: 403 })
  }
  return NextResponse.next()
}
