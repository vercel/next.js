import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const delay = 3000

export async function GET(req: NextRequest) {
  const start = Date.now()
  const data = await fetch(
    `https://next-data-api-endpoint.vercel.app/api/delay?delay=${delay}`,
    { next: { revalidate: 3 } }
  ).then((res) => res.json())
  const fetchDuration = Date.now() - start

  return NextResponse.json({ fetchDuration, data, now: Date.now() })
}
