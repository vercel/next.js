import { NextResponse } from 'next/server'

export function middleware() {
  return NextResponse.next(null, {
    headers: {
      'x-test-header': 'just a header',
    },
  })
}
