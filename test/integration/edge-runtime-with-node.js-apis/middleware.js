import { NextResponse } from 'next/server'
import { invokeNodeAPI } from './lib/utils'

export default function middleware({ nextUrl }) {
  invokeNodeAPI(nextUrl.pathname.slice(1))
  return nextUrl.pathname.startsWith('/api')
    ? NextResponse.next()
    : NextResponse.rewrite(new URL('/', nextUrl))
}
