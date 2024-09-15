import { NextResponse, type NextRequest } from 'next/server'
import { draftMode } from 'next/headers'

export function middleware(req: NextRequest) {
  const { isEnabled } = draftMode()
  console.log('draftMode().isEnabled from middleware:', isEnabled)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}
