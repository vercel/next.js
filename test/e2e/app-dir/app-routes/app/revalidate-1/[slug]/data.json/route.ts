import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1

export function generateStaticParams() {
  console.log('generateStaticParams static/[slug]')
  return [{ slug: 'first' }, { slug: 'second' }]
}

export const GET = (req: NextRequest, { params }) => {
  return NextResponse.json({ params, now: Date.now() })
}
