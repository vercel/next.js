import { NextResponse, type NextRequest } from 'next/server'
import { declared } from './lib/declared/proxy'
import { undeclared } from './lib/undeclared/proxy'
import { read } from './lib/use'

export function proxy(request: NextRequest) {
  return NextResponse.json(
    read(
      () => undeclared(),
      () => declared(),
      request.nextUrl.searchParams.has('use')
    )
  )
}

export const config = {
  matcher: '/proxy',
}
