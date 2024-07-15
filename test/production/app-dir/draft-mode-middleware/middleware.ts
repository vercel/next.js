import { NextResponse, type NextRequest } from 'next/server'
import { draftMode } from 'next/headers'

export function middleware(req: NextRequest) {
  const { isEnabled } = draftMode()

  // This should return `true` when draft mode enabled
  // but always returns false.
  console.log('draftMode().isEnabled from middleware:', isEnabled)

  // Request is allowed, return response
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}
