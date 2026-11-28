import { NextResponse } from 'next/server'

// A no-op middleware that simply passes through - this is enough to trigger
// the bug where router.query loses dynamic path parameters during
// client-side navigation (issue #54077)
export function middleware() {
  return NextResponse.next()
}
