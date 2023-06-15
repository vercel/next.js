import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ url: 'https://www.example.com' })
}
