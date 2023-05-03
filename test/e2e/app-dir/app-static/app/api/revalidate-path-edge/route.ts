import { NextRequest, NextResponse } from 'next/server'
import { unstable_revalidatePath } from 'next/cache'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') || '/'
  try {
    console.log('revalidating path', path)
    unstable_revalidatePath(path)
    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    console.error('Failed to revalidate', path, err)
    return NextResponse.json({ revalidated: false, now: Date.now() })
  }
}
