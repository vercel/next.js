import { draftMode } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const draft = await draftMode()
  draft.enable()
  const destination = new URL('/article/one', request.url)
  destination.search = request.nextUrl.search
  return NextResponse.redirect(destination)
}
