import { NextRequest, NextResponse } from 'next/server'

export default function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/rewrite-me-isr-false') {
    req.nextUrl.pathname = '/rewritten-isr-false'
    return NextResponse.rewrite(req.nextUrl)
  }

  if (req.nextUrl.pathname === '/rewrite-me-isr-3') {
    req.nextUrl.pathname = '/rewritten-isr-3'
    return NextResponse.rewrite(req.nextUrl)
  }
}
