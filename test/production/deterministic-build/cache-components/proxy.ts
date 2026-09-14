import { NextRequest, NextResponse } from 'next/server'

export async function proxy(req: NextRequest) {
  if (req.nextUrl.toString().endsWith('/proxy')) {
    return Response.json({ data: 'hello' })
  }

  return NextResponse.next()
}
