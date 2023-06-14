import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // don't error during build
    cookies()
  } else {
    return NextResponse.next()
  }
}
