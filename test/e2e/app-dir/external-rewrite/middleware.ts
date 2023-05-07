import { NextResponse, type NextRequest } from 'next/server'

export default function middleware(request: NextRequest) {
  return NextResponse.rewrite(
    new URL(request.nextUrl.pathname, 'https://eolmr5jlg1hnlc2.m.pipedream.net')
  )
}

export const config = {
  matcher: ['/test'],
}
