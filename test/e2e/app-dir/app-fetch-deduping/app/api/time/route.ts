import { NextResponse } from 'next/server'

export async function GET() {
  console.log('Route Handler invoked')

  return NextResponse.json({ time: Date.now() })
}
