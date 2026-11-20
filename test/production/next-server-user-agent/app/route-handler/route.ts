import { NextResponse, userAgent, type NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return NextResponse.json(userAgent(request))
}
