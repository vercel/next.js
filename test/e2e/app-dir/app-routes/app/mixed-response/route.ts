import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

export async function GET() {
  if (process.env.COND_1) {
    return NextResponse.json({ a: '1' })
  } else if (process.env.COND_2) {
    redirect('/no-response')
  } else {
    return new Response('3')
  }
}
