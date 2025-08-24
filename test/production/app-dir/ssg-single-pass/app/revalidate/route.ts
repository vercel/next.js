import { NextResponse } from 'next/server'
import { unstable_expirePath } from 'next/cache'

export async function GET() {
  unstable_expirePath('/')

  return NextResponse.json({ success: true })
}
