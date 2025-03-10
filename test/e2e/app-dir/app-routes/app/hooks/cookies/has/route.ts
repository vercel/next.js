import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const c = await cookies()
  c.set('a', 'a')
  const hasCookie = c.has('a')

  return NextResponse.json({ hasCookie }) // expect { hasCookie: true }
}
