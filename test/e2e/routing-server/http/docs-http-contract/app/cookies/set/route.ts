import { NextResponse } from 'next/server'

export function GET() {
  const response = NextResponse.json({ set: true })
  response.cookies.set('first', 'one', { path: '/', httpOnly: true })
  response.cookies.set('second', 'two', { path: '/', httpOnly: true })
  return response
}
