import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  return new NextResponse('Hello World', { status: 200 })
}
