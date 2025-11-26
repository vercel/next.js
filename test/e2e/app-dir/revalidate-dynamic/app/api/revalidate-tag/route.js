import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export async function GET(req) {
  revalidateTag('thankyounext', 'expireNow')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
