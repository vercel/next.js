import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(_request: NextRequest) {
  return NextResponse.json(process.env)
}

export const config = {
  matcher: '/body',
}
