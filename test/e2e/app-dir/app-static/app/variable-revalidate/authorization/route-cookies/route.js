import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieData = await cookies()

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        Authorization: 'Bearer token',
      },
    }
  ).then((res) => res.text())

  console.log('has cookie data', !!cookieData)

  return NextResponse.json({ random: data })
}
