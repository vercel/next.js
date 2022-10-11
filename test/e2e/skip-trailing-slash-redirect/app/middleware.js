import { NextResponse } from 'next/server'

export default function handler(req) {
  if (req.nextUrl.pathname.startsWith('/_next/data/missing-id')) {
    console.log(`missing-id rewrite: ${req.nextUrl.toString()}`)
    return NextResponse.rewrite('https://example.vercel.sh')
  }

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

  if (req.nextUrl.pathname.startsWith('/api/test-cookie')) {
    const res = NextResponse.next()
    res.cookies.set('from-middleware', 1)
    return res
  }

  if (req.nextUrl.pathname === '/middleware-response-body') {
    return new Response('hello from middleware', {
      headers: {
        'x-from-middleware': 'true',
      },
    })
  }

  return NextResponse.next()
}
