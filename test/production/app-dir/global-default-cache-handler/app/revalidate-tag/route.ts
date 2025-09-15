import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  console.log(req.url.toString())

  revalidateTag(req.nextUrl.searchParams.get('tag') || '', 'never')

  return NextResponse.json({ success: true })
}
