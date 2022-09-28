import { NextResponse } from 'next/server'

export default function handler(req) {
  if (req.nextUrl.pathname === '/middleware-rewrite-with-slash') {
    return NextResponse.rewrite(new URL('/another/', req.nextUrl))
  }

  if (req.nextUrl.pathname === '/middleware-rewrite-without-slash') {
    return NextResponse.rewrite(new URL('/another', req.nextUrl))
  }

  if (req.nextUrl.pathname === '/middleware-redirect-external-with') {
    return NextResponse.redirect('https://example.vercel.sh/somewhere/', 307)
  }

  if (req.nextUrl.pathname === '/middleware-redirect-external-without') {
    return NextResponse.redirect('https://example.vercel.sh/somewhere', 307)
  }

  return NextResponse.next()
}
