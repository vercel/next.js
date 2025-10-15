import { NextRequest, NextResponse } from 'next/server'

// @ts-ignore
import imported from './public/vercel.png'
const url = new URL('./public/vercel.png', import.meta.url).toString()

export async function middleware(req: NextRequest) {
  if (req.nextUrl.toString().endsWith('/middleware')) {
    return Response.json({ imported, url })
  }

  return NextResponse.next()
}
