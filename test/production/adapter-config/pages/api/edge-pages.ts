import { NextRequest, NextResponse } from 'next/server'

export const config = {
  runtime: 'edge',
  maxDuration: 80,
}

export default function handler(req: NextRequest) {
  return NextResponse.json({ now: Date.now() })
}
