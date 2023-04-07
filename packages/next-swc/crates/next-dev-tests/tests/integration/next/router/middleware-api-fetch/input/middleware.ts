import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const url = new URL(req.url)
  const { searchParams } = url
  const origin = searchParams.get('origin')
    ? `http://${searchParams.get('origin')}`
    : url.origin

  const res = await fetch(`${origin}/api/endpoint`)
  const json = await res.json()
  return NextResponse.json({ ...json, origin })
}

export const config = {
  matcher: '/fetch-endpoint',
}
