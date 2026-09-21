import { connection, NextResponse } from 'next/server'

export async function GET() {
  await connection()
  return NextResponse.upgrade({})
}
