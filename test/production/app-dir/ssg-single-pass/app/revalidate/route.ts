import { NextResponse } from 'next/server'
import { expirePath } from 'next/cache'

export async function GET() {
  expirePath('/')

  return NextResponse.json({ success: true })
}
