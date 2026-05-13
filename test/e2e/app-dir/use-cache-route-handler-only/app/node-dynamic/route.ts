import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedRandom() {
  'use cache'

  // Simulate I/O latency so concurrent requests overlap.
  await setTimeout(1000)

  return Math.random()
}

export async function GET() {
  await connection()

  const rand = await getCachedRandom()

  return Response.json({ rand })
}
