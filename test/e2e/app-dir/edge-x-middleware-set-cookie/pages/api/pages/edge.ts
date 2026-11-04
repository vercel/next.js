import { NextResponse } from 'next/server'

export const config = { runtime: 'edge' }

export default function handler() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('pages-edge', 'dummy-http-only-marker', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
}
