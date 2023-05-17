import { NextResponse } from 'next/server'

export async function GET(): Promise<Response> {
  return NextResponse.json({
    msg: 'Hello edge!',
    runtime: process.env.NEXT_RUNTIME,
  })
}

export const runtime = 'edge'
