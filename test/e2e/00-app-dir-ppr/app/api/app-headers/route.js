import { NextResponse } from 'next/server'
export function GET(req) {
  return NextResponse.json({ port: req.headers.get('x-forwarded-port') })
}
