import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.text()
  return new NextResponse(
    JSON.stringify({
      message: 'Hello World',
      bodySize: body.length,
      contentLength: request.headers.get('content-length'),
      probe: request.headers.get('x-body-probe'),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}
