// Ensure that https://github.com/vercel/next.js/issues/56286 is fixed.
import { NextResponse } from 'next/server'

export async function middleware(req) {
  if (req.nextUrl.pathname.includes('rewrite-to-static-first')) {
    req.nextUrl.pathname = '/static/first'
    return NextResponse.rewrite(req.nextUrl)
  }

  return NextResponse.next()
}
