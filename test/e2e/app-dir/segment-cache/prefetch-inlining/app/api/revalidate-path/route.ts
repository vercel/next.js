import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') || '/'

  try {
    revalidatePath(path)
    return NextResponse.json({ revalidated: true, path })
  } catch {
    return NextResponse.json({ revalidated: false, path }, { status: 500 })
  }
}
