import { NextResponse, revalidateTag } from 'next/server'

export const revalidate = 0

export async function GET(req) {
  await revalidateTag('thankyounext')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
