import { expireTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  expireTag('thankyounext')
  return NextResponse.json({ done: true })
}
