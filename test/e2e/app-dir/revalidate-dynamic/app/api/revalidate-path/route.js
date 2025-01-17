import { NextResponse } from 'next/server'
import { unstable_expirePath } from 'next/cache'

export async function GET(req) {
  unstable_expirePath('/')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
