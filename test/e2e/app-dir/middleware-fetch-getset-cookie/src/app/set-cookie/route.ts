import { NextResponse } from 'next/server'

export async function GET() {
  const headers = new Headers()
  headers.append('set-cookie', 'foo=foo')
  headers.append('set-cookie', 'bar=bar')
  return NextResponse.json(
    {
      setCookies: headers.getSetCookie(),
    },
    {
      headers,
    }
  )
}
