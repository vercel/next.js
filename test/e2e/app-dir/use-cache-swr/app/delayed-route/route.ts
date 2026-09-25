import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedData(id: string | null) {
  'use cache'

  cacheLife('seconds')
  if (id !== null) {
    cacheTag(id)
  }

  console.log('use-cache-swr: generating delayed data', id)
  await setTimeout(1000)
  console.log('use-cache-swr: generated delayed data', id)

  return new Date().toISOString()
}

export async function GET(request: Request) {
  await connection()
  const id = new URL(request.url).searchParams.get('id')
  const cached = await getCachedData(id)
  const dynamic = new Date().toISOString()

  return Response.json({ cached, dynamic })
}
