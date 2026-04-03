import { NextResponse } from 'next/server'

// Pure route handler with no client component imports
export async function GET() {
  return NextResponse.json({ message: 'Hello from pure route handler' })
}
