import { NextResponse } from 'next/server'

export async function GET(request) {
  const requestCookies = request.cookies

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      headers: {
        Authorization: 'Bearer token',
      },
    }
  ).then((res) => res.text())

  console.log('has cookie data', !!requestCookies)

  return NextResponse.json({ random: data })
}
