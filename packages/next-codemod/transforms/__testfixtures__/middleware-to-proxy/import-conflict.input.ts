import { NextResponse } from 'next/server'
// @ts-expect-error: test fixture
import { proxy } from 'some-library'

export function middleware() {
  return NextResponse.next()
}