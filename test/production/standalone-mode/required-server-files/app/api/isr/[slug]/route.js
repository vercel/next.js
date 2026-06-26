import { NextResponse } from 'next/server'

export const revalidate = 3

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export async function GET(req, { params }) {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        tags: ['isr-page'],
      },
    }
  ).then((res) => res.text())

  return NextResponse.json({
    now: Date.now(),
    params,
    data,
  })
}
