import { NextResponse } from 'next/server'
import { textValue, TestLink } from './lib/shared-module'

export function middleware(request) {
  if (request.nextUrl.pathname === '/middleware') {
    return Response.json({
      textValue,
      linkType: typeof TestLink,
    })
  }

  return NextResponse.next()
}
