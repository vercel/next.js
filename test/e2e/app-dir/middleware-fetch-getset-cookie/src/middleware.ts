import { NextResponse } from 'next/server'

export async function middleware() {
  // forced port: 7777
  const fetchResponse = await fetch('http://localhost:7777/set-cookie')
  const getSetCookies = fetchResponse.headers.getSetCookie()

  // should be ['foo=foo', 'bar=bar']
  if (getSetCookies.length <= 1) {
    return NextResponse.next({ status: 500 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}
