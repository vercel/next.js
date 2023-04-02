import { NextResponse, revalidateTag } from 'next/server'

export const runtime = 'edge'

export default async function handler(_req) {
  await revalidateTag('thankyounext')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
