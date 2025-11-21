import { NextResponse } from 'next/server'

export const revalidate = false

export async function GET() {
  console.log('Load data')
  return NextResponse.json({
    now: Date.now(),
    content: Array.from(new Array(3 * 1024 * 1024))
      .map(() => 1)
      .join(''),
  })
}
