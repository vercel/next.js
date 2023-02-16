import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const url = new URL('/basic/endpoint', request.nextUrl)
  return NextResponse.rewrite(url)
}
