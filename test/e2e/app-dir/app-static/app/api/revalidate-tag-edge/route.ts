import { NextResponse, revalidateTag } from 'next/server'

export const revalidate = 0
export const runtime = 'edge'

export async function GET(_req) {
  await revalidateTag('thankyounext')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
