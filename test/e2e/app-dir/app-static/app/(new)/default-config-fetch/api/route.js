import { NextResponse } from 'next/server'

export async function GET() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?default-config-fetch',
    { cache: 'default' }
  ).then((res) => res.text())

  return NextResponse.json({ data })
}
