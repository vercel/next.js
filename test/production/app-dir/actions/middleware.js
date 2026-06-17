// Ensure that https://github.com/vercel/next.js/issues/56286 is fixed.
import { NextResponse } from 'next/server'

export async function middleware(req) {
  if (req.nextUrl.pathname.includes('rewrite-to-static-first')) {
    req.nextUrl.pathname = '/static/first'
    return NextResponse.rewrite(req.nextUrl)
  }

  if (req.method === 'POST' && req.nextUrl.pathname.includes('body-finalize')) {
    const body = await req.json()

    console.log(
      'Middleware - Body length: %d bytes',
      new TextEncoder().encode(JSON.stringify(body)).length
    )
  }

  return NextResponse.next()
}

/**
 * @type {import('next/server').ProxyConfig}
 */
export const config = {
  runtime: 'nodejs',
}
