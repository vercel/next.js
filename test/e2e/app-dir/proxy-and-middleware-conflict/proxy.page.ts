import { NextResponse } from 'next/server'

export function proxy() {
  return NextResponse.next()
}
