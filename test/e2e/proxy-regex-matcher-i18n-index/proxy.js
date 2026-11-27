import { NextResponse } from 'next/server'

export const config = {
  matcher: '/(.*)',
}

export default function proxy() {
  return NextResponse.next()
}
