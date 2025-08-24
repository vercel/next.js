import { NextResponse } from 'next/server'

export const revalidate = false

export function GET() {
  const res = new NextResponse()
  res.cookies.set('theme', 'light')
  res.cookies.set('my_company', 'ACME')
  return res
}
