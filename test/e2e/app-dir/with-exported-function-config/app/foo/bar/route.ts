import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ hello: 'world' })
}

export const runtime = 'edge'
export const maxDuration = 2
