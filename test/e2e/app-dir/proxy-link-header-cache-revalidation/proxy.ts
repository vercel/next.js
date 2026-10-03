import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const rewriteUrl = new URL('/rewritten', request.url)

  const origin = request.nextUrl.origin

  const alternateLinks = [
    `<${origin}/ru>; rel="alternate"; hreflang="ru"`,
    `<${origin}/en>; rel="alternate"; hreflang="en"`,
    `<${origin}/zh>; rel="alternate"; hreflang="zh"`,
    `<${origin}/>; rel="alternate"; hreflang="x-default"`,
  ].join(', ')

  const response = NextResponse.rewrite(rewriteUrl)
  response.headers.set('Link', alternateLinks)

  return response
}

export const config = {
  matcher: ['/ru'],
}
