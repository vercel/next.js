import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 1

export function generateStaticParams() {
  console.log('generateStaticParams static/[slug]')
  return [{ slug: 'first' }, { slug: 'second' }]
}

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) => {
  const resolvedParams = await params
  return NextResponse.json({ params: resolvedParams, now: Date.now() })
}
