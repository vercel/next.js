import { NextResponse } from 'next/server'
import magicValue from 'shared-package'

export function middleware(request) {
  if (magicValue !== 42) throw new Error('shared-package problem')
  return NextResponse.rewrite(new URL('/about/a', request.url))
}
