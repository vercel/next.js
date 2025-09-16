import { NextRequest, NextResponse } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default function handler(req: NextRequest) {
  return NextResponse.json({ now: Date.now() })
}
