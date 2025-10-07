import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export function GET(req: NextRequest) {
  console.log(req.url.toString())
  return NextResponse.json({
    now: Date.now(),
  })
}
