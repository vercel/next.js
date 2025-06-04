import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    // don't error during build
    await cookies()
  } else {
    const url = new URL('/basic/endpoint', request.nextUrl)
    return NextResponse.rewrite(url)
  }
}
