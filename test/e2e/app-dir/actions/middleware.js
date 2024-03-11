// Ensure that https://github.com/vercel/next.js/issues/56286 is fixed.
import { NextResponse } from 'next/server'

export async function middleware() {
  return NextResponse.next()
}
