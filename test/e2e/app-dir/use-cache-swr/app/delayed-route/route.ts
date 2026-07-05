import { cacheLife } from 'next/cache'
import { setTimeout } from 'timers/promises'

async function getCachedData() {
  'use cache'

  cacheLife('seconds')

  await setTimeout(1000)

  return new Date().toISOString()
}

export async function GET() {
  const cached = await getCachedData()
  const dynamic = new Date().toISOString()

  return Response.json({ cached, dynamic })
}
