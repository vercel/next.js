import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.set('visitor', 'changed', { httpOnly: true, path: '/' })
  return NextResponse.json({ visitor: cookieStore.get('visitor')?.value })
}
