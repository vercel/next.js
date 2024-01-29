import { NextResponse } from 'next/server'

export async function GET() {
  console.log('Starting...')

  return NextResponse.json({ time: Date.now() })
}
