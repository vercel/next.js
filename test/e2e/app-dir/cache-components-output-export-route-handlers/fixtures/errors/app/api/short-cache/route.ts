import { cacheLife } from 'next/cache'

async function getValue() {
  'use cache'
  cacheLife({ stale: 0, revalidate: 1, expire: 60 })
  return Math.random()
}

export async function GET() {
  return Response.json({ value: await getValue() })
}
