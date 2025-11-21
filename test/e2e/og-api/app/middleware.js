import { NextResponse } from 'next/server'
import { ImageResponse } from 'next/og'

export async function middleware(req) {
  if (req.nextUrl.pathname === '/middleware') {
    return new ImageResponse(<div>hi</div>, {
      width: 1200,
      height: 630,
    })
  }
  return NextResponse.next()
}
