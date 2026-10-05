import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string; countryCode: string }> }
) {
  const key = request.nextUrl.searchParams.get('key')
  if (!key) {
    return new Response('A query key is required', { status: 400 })
  }
  const { lang, countryCode } = await params
  revalidateTag(`swr:${key}:${lang}:${countryCode}`, 'minutes')
  return new Response(null, { status: 204 })
}
