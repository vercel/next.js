import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get('param') as string
  return NextResponse.json({ param })
}
