import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'

export const revalidate = 0
export const runtime = 'edge'

export async function GET(req) {
  const tag = req.nextUrl.searchParams.get('tag')
  revalidateTag(tag)
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
