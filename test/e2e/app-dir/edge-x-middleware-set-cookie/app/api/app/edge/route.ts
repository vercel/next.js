import { NextResponse } from 'next/server'

export const runtime = 'edge'

export function GET() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('app-edge', 'dummy-http-only-marker', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
}
