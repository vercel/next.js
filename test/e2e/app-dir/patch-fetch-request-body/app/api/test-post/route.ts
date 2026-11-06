import { NextResponse } from 'next/server'

export async function POST() {
  const req = new Request(
    `http://localhost:${process.env.EXTERNAL_SERVER_PORT}/post`,
    {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
      headers: { 'Content-Type': 'application/json' },
    }
  )

  const res = await fetch(req)
  const data = await res.json()
  return NextResponse.json({ status: res.status, data })
}
