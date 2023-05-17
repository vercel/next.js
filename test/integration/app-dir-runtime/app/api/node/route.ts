import { NextResponse } from 'next/server'

export async function GET(): Promise<Response> {
  return NextResponse.json({
    msg: 'Hello node.js!',
    runtime: process.env.NEXT_RUNTIME,
  })
}
