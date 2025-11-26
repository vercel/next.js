import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import foo from 'foo'

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  return NextResponse.json({ foo })
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/middleware',
}
