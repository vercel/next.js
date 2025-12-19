import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export const revalidate = 0

export async function GET(req) {
  const tag = req.nextUrl.searchParams.get('tag')
  const profile = req.nextUrl.searchParams.get('profile')
  revalidateTag(tag, profile || 'expireNow')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
