import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  return NextResponse.json({
    runtime: 'node',
    payload: `isOdd: ${globalThis.isOdd ? globalThis.isOdd(2) : 'unknown'}`,
  })
}
