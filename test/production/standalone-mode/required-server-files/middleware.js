import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'

export async function middleware(req) {
  console.log('middleware', req.url)
  if (req.nextUrl.pathname === '/a-non-existent-page/to-test-with-middleware') {
    return new ImageResponse(<div>Hello world</div>, {
      width: 1200,
      height: 600,
    })
  }
  if (req.nextUrl.pathname.startsWith('/rewrite-me')) {
    // strip the leading `/rewrite-me` from the path
    return NextResponse.rewrite(`/${req.nextUrl.pathname.substr(11)}`)
  }
  return NextResponse.next()
}
