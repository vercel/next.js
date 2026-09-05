import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cookies } from 'next/headers'
import { cacheLife } from 'next/cache'

export async function getRecommendations() {
  'use cache: private'
  cacheLife({ revalidate: 300 })

  const uid = (await cookies()).get('uid')?.value ?? 'anon'

  // Simulate the expensive scoring pass over the catalog.
  await new Promise((resolve) => setTimeout(resolve, 200))

  const catalog: string[] = JSON.parse(
    readFileSync(join(process.cwd(), 'data', 'catalog.json'), 'utf-8')
  )
  const seed = [...uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const items = [0, 1, 2].map((i) => catalog[(seed + i * 3) % catalog.length])

  const stamp = Math.random().toString(36).slice(2)
  appendFileSync(
    join(process.cwd(), 'data', 'compute-log.ndjson'),
    JSON.stringify({ user: uid, stamp }) + '\n'
  )

  return { items, stamp }
}
