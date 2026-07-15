import { NextResponse, type NextRequest } from 'next/server'
import { draftMode } from 'next/headers'

export async function middleware(req: NextRequest) {
  const draft = await draftMode()

  if (req.nextUrl.searchParams.get('draft') === 'true') {
    draft.enable()
  } else if (req.nextUrl.searchParams.get('draft') === 'false') {
    draft.disable()
  }

  const res = NextResponse.next()
  res.headers.set('x-draft-mode', draft.isEnabled ? 'enabled' : 'disabled')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}
