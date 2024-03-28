import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.permanentRedirect('https://nextjs.org/')
}
