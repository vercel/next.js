import type { NextRequest } from 'next/server'

type Locale = 'en' | 'de'

export const dynamicParams = false

export function generateStaticParams(): { locale: Locale }[] {
  return [{ locale: 'en' }, { locale: 'de' }]
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locale: Locale }> }
) {
  const { locale } = await params
  return Response.json({ locale })
}
