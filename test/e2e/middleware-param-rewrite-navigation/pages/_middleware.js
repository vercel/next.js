import { NextResponse } from 'next/server'

export default function middleware(req) {
  const url = req.nextUrl.clone()
  const param = url.pathname === '/a' ? 'b' : 'a'
  url.searchParams.append('param', param)
  return NextResponse.rewrite(url)
}
