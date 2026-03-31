import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

const isCacheComponentsEnabled = !!process.env.__NEXT_CACHE_COMPONENTS

export async function GET(request: NextRequest) {
  const sourcePath = request.nextUrl.searchParams.get('path')

  if (!sourcePath) {
    return NextResponse.json(
      { error: 'Missing path parameter' },
      { status: 400 }
    )
  }

  const prefix = isCacheComponentsEnabled ? '/cache-components' : '/legacy'
  revalidatePath(`${prefix}${sourcePath}`)

  return NextResponse.json({ revalidated: true })
}
