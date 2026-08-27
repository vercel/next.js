import { notFound } from 'next/navigation'
import { NextResponse } from 'next/server'

export const revalidate = 60
export const dynamicParams = true

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (slug !== 'known') {
    notFound()
  }

  return NextResponse.json({ slug })
}
