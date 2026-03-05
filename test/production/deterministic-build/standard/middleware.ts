import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.toString().endsWith('/middleware')) {
    const url = new URL('/vercel.png', req.nextUrl.origin).toString()
    return Response.json({ url })
  }

  return NextResponse.next()
}
