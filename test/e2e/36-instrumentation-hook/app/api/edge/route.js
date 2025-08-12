import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

export async function GET(request) {
  return NextResponse.json({
    runtime: 'edge',
    payload: `isOdd: ${globalThis.isOdd ? globalThis.isOdd(2) : 'unknown'}`,
  })
}
