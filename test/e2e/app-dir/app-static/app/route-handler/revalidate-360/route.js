import { NextResponse } from 'next/server'

export const revalidate = 0

export async function GET() {
  const data360 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        revalidate: 360,
        tags: ['thankyounext'],
      },
    }
  ).then((res) => res.text())

  const data10 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=10',
    {
      next: {
        revalidate: 10,
        tags: ['thankyounext'],
      },
    }
  ).then((res) => res.text())

  return NextResponse.json({ data360, data10 })
}
