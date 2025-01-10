import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'force-cache' }
  ).then((res) => res.text())

  return NextResponse.json({ random: data })
}
