import { NextResponse } from 'next/server'
import { unstable_expireTag } from 'next/cache'

export async function GET(req) {
  unstable_expireTag('thankyounext')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
