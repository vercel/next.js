import { readFile } from 'node:fs/promises'
import { cacheLife } from 'next/cache'

export async function getState(slug: string): Promise<string> {
  'use cache'
  cacheLife({ stale: 300, revalidate: 60, expire: 3600 })
  const states = JSON.parse(await readFile('states.json', 'utf8'))
  return states[slug] ?? 'content'
}
