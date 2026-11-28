import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.set('route-handler-cookie', 'route-value', { revalidate: false })
  cookieStore.delete({ name: 'other-cookie', revalidate: false })
  return NextResponse.json({ ok: true })
}
