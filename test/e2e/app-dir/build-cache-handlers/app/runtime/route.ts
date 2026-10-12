import { connection } from 'next/server'

async function getHandler(key: string) {
  'use cache'
  return { key, handler: (globalThis as any).__testCacheHandler }
}

export async function GET(request: Request) {
  await connection()
  return Response.json(await getHandler(new URL(request.url).search))
}
