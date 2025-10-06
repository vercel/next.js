import { NextResponse } from 'next/server'
import { textValue, TestLink } from './lib/shared-module'

export function middleware(request) {
  if (request.nextUrl.pathname === '/middleware') {
    let testLink
    try {
      testLink = TestLink.$$typeof.toString()
    } catch (e) {
      testLink = e.message
    }
    return Response.json({
      clientReference: testLink,
      textValue,
    })
  }

  return NextResponse.next()
}
