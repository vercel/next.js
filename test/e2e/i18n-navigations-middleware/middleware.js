import { NextResponse } from 'next/server'

export const config = { matcher: ['/foo'] }
export async function middleware(req) {
  return NextResponse.next()
}
