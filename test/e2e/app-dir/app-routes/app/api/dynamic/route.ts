import { NextRequest, NextResponse } from 'next/server'

export const GET = (req: NextRequest) => {
  return NextResponse.json({
    pathname: req.nextUrl.pathname,
    query: Object.fromEntries(req.nextUrl.searchParams),
  })
}
