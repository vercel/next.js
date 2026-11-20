import { NextResponse } from 'next/server'

Reflect.set(globalThis, Symbol.for('next.test.proxy-unmatched-startup'), true)

export default function proxy() {
  return NextResponse.next({ headers: { 'x-proxy-ran': '1' } })
}

export const config = { matcher: '/guarded' }
