import { NextRequest, NextResponse } from 'next/server'

export const GET = (req: NextRequest) => {
  const url = new URL(req.url)
  return NextResponse.json({
    url: url.pathname,
    nextUrl: req.nextUrl.pathname,
  })
}
