import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

const isCacheComponentsEnabled = !!process.env.__NEXT_CACHE_COMPONENTS

export async function GET(request) {
  const lang = request.nextUrl.searchParams.get('lang') || 'en'

  // With rewrites, we need to revalidate the destination path (the actual
  // page), not the source path that users visit.
  const path = isCacheComponentsEnabled
    ? `/${lang}/cache-components/`
    : `/${lang}/legacy/`

  revalidatePath(path)

  return NextResponse.json({ timestamp: new Date().toISOString() })
}
