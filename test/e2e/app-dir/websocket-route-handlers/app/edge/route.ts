import { NextResponse } from 'next/server'

export const runtime = 'edge'

export function GET(request: Request) {
  if (request.headers.get('x-test-upgrade') === '1') {
    return NextResponse.upgrade({})
  }
  return new Response('edge route')
}
