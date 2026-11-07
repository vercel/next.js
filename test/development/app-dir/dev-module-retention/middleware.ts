import { NextResponse } from 'next/server'
import { revision } from './lib/version'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-revision', revision)
  response.headers.set('x-environment', process.env.RETENTION_ENV!)
  return response
}

export const config = { matcher: ['/api/:path*'] }
