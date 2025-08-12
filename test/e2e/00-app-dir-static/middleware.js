import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.nextUrl.pathname === '/middleware-to-dashboard') {
    // TODO: this does not copy __flight__ and __flight_router_state_tree__
    return NextResponse.rewrite(new URL('/dashboard', request.url))
  }
}
