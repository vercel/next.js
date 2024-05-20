import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')

  if (status === 'enable') {
    draftMode().enable()
  } else {
    draftMode().disable()
  }

  return NextResponse.json({
    status,
  })
}
