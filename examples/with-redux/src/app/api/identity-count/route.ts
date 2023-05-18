/* Core */
import { NextResponse } from 'next/server'
import waait from 'waait'

export async function POST(req: Request, res: Response) {
  const body = await req.json()
  const { amount = 1 } = body

  // simulate IO latency
  await waait(500)

  return NextResponse.json({ data: amount })
}
