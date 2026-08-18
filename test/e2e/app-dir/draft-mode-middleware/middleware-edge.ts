import { NextResponse, type NextRequest } from 'next/server'
import { draftMode } from 'next/headers'

export async function middleware(req: NextRequest) {
  const draft = await draftMode()

  if (req.nextUrl.searchParams.get('draft') === 'true') {
    draft.enable()
  }

  // Log as a single string so the boolean isn't colorized with ANSI escape
  // codes when running in the Node.js runtime.
  console.log(`draftMode().isEnabled from middleware: ${draft.isEnabled}`)

  const res = NextResponse.next()
  res.headers.set('x-draft-mode', draft.isEnabled ? 'enabled' : 'disabled')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}
