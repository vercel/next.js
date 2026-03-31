import { NextResponse } from 'next/server'
export default function middleware() {
  return NextResponse.next()
}
