import { NextResponse, userAgent, type NextRequest } from 'next/server'

export const config = { runtime: 'edge' }

export default function handler(request: NextRequest) {
  return NextResponse.json(userAgent(request))
}
