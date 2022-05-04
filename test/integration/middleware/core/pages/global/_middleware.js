import { NextResponse } from 'next/server'

export async function middleware() {
  console.log(process.env.MIDDLEWARE_TEST)
  return new NextResponse(null, {
    headers: { data: JSON.stringify({ process: { env: process.env } }) },
  })
}
