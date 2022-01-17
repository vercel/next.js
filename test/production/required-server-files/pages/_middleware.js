import { NextResponse } from 'next/server'

export async function middleware(req) {
  return NextResponse.next()
}
