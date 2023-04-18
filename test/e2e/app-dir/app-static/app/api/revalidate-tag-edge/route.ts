import { NextResponse, revalidateTag } from 'next/server'

export const revalidate = 0

export async function GET(req) {
  const tag = req.nextUrl.searchParams.get('tag')
  revalidateTag(tag)
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
