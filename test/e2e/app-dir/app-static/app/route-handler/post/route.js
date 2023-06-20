import { NextResponse } from 'next/server'

export async function POST() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      method: 'POST',
    }
  ).then((res) => res.text())

  return NextResponse.json({ data })
}
