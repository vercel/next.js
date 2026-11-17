import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  if (request.nextUrl.searchParams.get('draft') === 'true') {
    ;(await draftMode()).enable()
  }

  const response = NextResponse.next()
  response.headers.set(
    'x-draft-mode',
    (await draftMode()).isEnabled ? 'enabled' : 'disabled'
  )
  return response
}

export const config = {
  matcher: ['/((?!enable|_next).*)'],
}
