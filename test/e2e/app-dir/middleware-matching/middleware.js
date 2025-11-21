import { NextResponse } from 'next/server'

export default function middleware(req, res) {
  const url = req.nextUrl.clone()
  url.pathname = '/'
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/chat/:id'],
}
