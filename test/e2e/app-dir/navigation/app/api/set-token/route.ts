import { NextResponse } from 'next/server'

export function POST() {
  const res = NextResponse.json({ message: 'successful' })
  res.cookies.set('token', 'this is a token')
  return res
}
