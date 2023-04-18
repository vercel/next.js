import { NextResponse, unstable_revalidateTag } from 'next/server'

export const revalidate = 0

export async function GET(req) {
  const tag = req.nextUrl.searchParams.get('tag')
  unstable_revalidateTag(tag)
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
