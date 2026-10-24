import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife, cacheTag } from 'next/cache'

export async function getItem(slug: string) {
  'use cache'
  cacheTag(`item-${slug}`)

  const raw = await readFile(
    path.join(process.cwd(), 'data', 'items.json'),
    'utf8'
  )
  const item: { title: string } | null = JSON.parse(raw)[slug] ?? null
  if (!item) {
    cacheLife('minutes')
  }

  return item
}
