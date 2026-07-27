import { NextResponse } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default function handler(req) {
  console.log('setting cookie in api route')
  const res = NextResponse.json({ name: 'API' })
  res.cookies.set('hello', 'From API')
  return res
}
