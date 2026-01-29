import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  if (req.nextUrl.toString().includes('/_next/image')) {
    console.debug('Requesting image:', req.nextUrl.toString())
  }

  if (req.nextUrl.toString().includes('/_next/static/media/test')) {
    console.debug('Requesting static media image:', req.nextUrl.toString())
    console.debug(`Simulating internal image request hang...`)
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  return NextResponse.next()
}
