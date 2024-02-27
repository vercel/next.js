import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

let count = 0

export const GET = async (req: NextRequest) => {
  await fetch(req.nextUrl)
  count++
  return NextResponse.json({ count })
}
