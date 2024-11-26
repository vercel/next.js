import { NextResponse } from 'next/server'
import { expireTag } from 'next/cache'

export const revalidate = 0

export async function GET(req) {
  const tag = req.nextUrl.searchParams.get('tag')
  expireTag(tag)
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
