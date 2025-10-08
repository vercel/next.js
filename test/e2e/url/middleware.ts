import { NextRequest, NextResponse } from 'next/server'

// @ts-ignore
import imported from './public/vercel.png'
const url = new URL('./public/vercel.png', import.meta.url)

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/middleware') {
    return Response.json({ imported, url })
  }

  return NextResponse.next()
}
