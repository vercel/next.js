import { NextResponse } from 'next/server'

export function middleware() {
  return NextResponse.rewrite('/about/a')
}
