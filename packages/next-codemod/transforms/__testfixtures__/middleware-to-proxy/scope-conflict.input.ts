import { NextResponse } from 'next/server'

const proxy = 'existing proxy variable'

export function middleware() {
  return NextResponse.next()
}