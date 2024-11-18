import { NextResponse } from 'next/server'
import { expirePath } from 'next/cache'

export async function GET(req) {
  expirePath('/')
  return NextResponse.json({ revalidated: true, now: Date.now() })
}
