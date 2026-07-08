import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  await headers()
  return NextResponse.upgrade({})
}
