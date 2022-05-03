import { NextResponse } from 'next/server'

export function middleware(req) {
  const url = req.nextUrl.clone()
  url.searchParams.set('locale', url.locale)
  return NextResponse.rewrite(url)
}
