import { cacheLife, cacheTag } from 'next/cache'

async function getCachedValue() {
  'use cache'

  // Keep time-based revalidation from masking missing tag propagation.
  cacheLife('hours')
  cacheTag('route-handler-tag')

  return Math.random()
}

export async function GET() {
  return Response.json({ value: await getCachedValue() })
}
