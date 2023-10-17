import { NextResponse } from 'next/server'

export default function handler(req) {
  const parsedOrigUrl = new URL(req.url)
  const origPathname = parsedOrigUrl.pathname
  const lowerPathname = origPathname.toLowerCase()

  // ensure locale casing can be redirected
  if (
    (lowerPathname.startsWith('/en') || lowerPathname.startsWith('/ja-jp')) &&
    origPathname !== lowerPathname &&
    !lowerPathname.includes('_next')
  ) {
    parsedOrigUrl.pathname = lowerPathname
    return NextResponse.redirect(parsedOrigUrl)
  }

  console.log(req.nextUrl)
  let { pathname } = req.nextUrl

  if (pathname.startsWith('/_next/data') && pathname.includes('locale-test')) {
    return NextResponse.json({
      locale: req.nextUrl.locale,
      pathname: req.nextUrl.pathname,
    })
  }

  if (pathname.includes('docs') || pathname.includes('chained-rewrite')) {
    if (pathname.startsWith('/en')) {
      pathname = pathname.replace(/^\/en/, '') || '/'
    }

    if (pathname === '/docs') {
      pathname = '/'
    }

    console.log(
      `rewriting to https://middleware-external-rewrite-target-epsp8idgo-uncurated-tests.vercel.app${pathname}`
    )

    return NextResponse.rewrite(
      `https://middleware-external-rewrite-target-epsp8idgo-uncurated-tests.vercel.app${pathname}`
    )
  }

  if (req.nextUrl.pathname.startsWith('/_next/data/missing-id')) {
    console.log(`missing-id rewrite: ${req.nextUrl.toString()}`)
    return NextResponse.rewrite('https://example.vercel.sh')
  }

  if (
    req.nextUrl.pathname.startsWith('/_next/data') &&
    req.nextUrl.pathname.endsWith('valid.json')
  ) {
    return NextResponse.rewrite('https://example.vercel.sh')
  }

  if (req.nextUrl.pathname.includes('/middleware-rewrite-with-slash')) {
    return NextResponse.rewrite(new URL('/another/', req.nextUrl))
  }

  if (req.nextUrl.pathname.includes('/middleware-rewrite-without-slash')) {
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
