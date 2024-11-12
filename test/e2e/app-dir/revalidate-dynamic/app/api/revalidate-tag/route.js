import { NextResponse } from 'next/server'
import { expireTag } from 'next/cache'

export async function GET(req) {
  expireTag('thankyounext')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
