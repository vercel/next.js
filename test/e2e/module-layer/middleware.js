import 'server-only'
import { NextResponse } from 'next/server'
// import './lib/mixed-lib'

export function middleware(request) {
  return NextResponse.next()
}
