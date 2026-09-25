import { cacheTag, revalidateTag } from 'next/cache'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

async function getCachedDate(key: string) {
  'use cache: remote'

  cacheTag(key)
  console.log(`tag-revalidation: generating ${key}`)
  await setTimeout(1000)
  console.log(`tag-revalidation: generated ${key}`)
  return new Date().toISOString()
}

export async function GET(request: Request) {
  await connection()

  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }

  return Response.json(await getCachedDate(key))
}

export async function POST(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) {
    return new Response('Missing key', { status: 400 })
  }

  revalidateTag(key, 'minutes')
  return new Response(null, { status: 204 })
}
