import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split('/').pop()
  await fetch(`${process.env.ROUTING_ISR_ORIGIN}/visit/${slug}`)
  if (request.nextUrl.pathname.startsWith('/article/')) {
    const destination = request.nextUrl.clone()
    destination.pathname = `/cached/${slug}`
    return NextResponse.rewrite(destination)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/article/:slug', '/cached/:slug'] }
