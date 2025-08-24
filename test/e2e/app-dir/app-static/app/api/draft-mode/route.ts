import { draftMode } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')

  if (status === 'enable') {
    ;(await draftMode()).enable()
  } else {
    ;(await draftMode()).disable()
  }

  return NextResponse.json({
    status,
  })
}
