import 'server-only'
import { NextResponse } from 'next/server'
// import { sharedComponentValue } from './lib/mixed-lib'

export function middleware(request) {
  // Just make sure variable `sharedComponentValue` won't be eliminated
  if (request.pathname === 'this-is-a-path-that-wont-trigger') {
    return NextResponse.redirect('/' + sharedComponentValue)
  }

  return NextResponse.next()
}
