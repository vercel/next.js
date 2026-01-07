import { cacheTag } from 'next/cache'

async function getCachedRandom() {
  'use cache'
  cacheTag('api')

  return Math.random()
}

export async function GET() {
  const rand1 = await getCachedRandom()
  const rand2 = await getCachedRandom()

  return Response.json({ rand1, rand2 })
}
