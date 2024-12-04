import { unstable_expireTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  unstable_expireTag('thankyounext')
  return NextResponse.json({ done: true })
}
