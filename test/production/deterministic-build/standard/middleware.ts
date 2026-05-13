import { NextRequest, NextResponse } from 'next/server'

const url = new URL('./public/vercel.png', import.meta.url).toString()

export async function middleware(req: NextRequest) {
  if (req.nextUrl.toString().endsWith('/middleware')) {
    return Response.json({ url })
  }

  return NextResponse.next()
}
