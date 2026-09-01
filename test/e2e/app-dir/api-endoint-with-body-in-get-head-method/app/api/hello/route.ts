import { type NextRequest, NextResponse } from 'next/server'

export async function GET(_: NextRequest) {
  return NextResponse.json({ msg: 'hello' })
}

export async function HEAD(_: NextRequest) {
  return NextResponse.json({}, { status: 200 })
}
