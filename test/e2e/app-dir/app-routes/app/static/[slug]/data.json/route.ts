import { NextRequest, NextResponse } from 'next/server'

export function generateStaticParams() {
  console.log('generateStaticParams static/[slug]')
  return [{ slug: 'first' }, { slug: 'second' }]
}

export const GET = async (
  req: NextRequest,
  props: { params: Promise<{ slug: string }> }
) => {
  const params = await props.params
  const resolvedParams = await params
  return NextResponse.json({ params: resolvedParams, now: Date.now() })
}
