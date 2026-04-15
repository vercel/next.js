import { NextResponse } from 'next/server'

export const config = {
  runtime: 'nodejs',
}

export default function middleware() {
  return NextResponse.next()
}
