import { readFile } from 'node:fs/promises'
import { cacheTag } from 'next/cache'

export const METADATA_TAG = 'metadata-parent-param-matching-validation:ids'

async function readIds(): Promise<{
  images: Record<string, string[]>
  sitemaps: string[]
}> {
  'use cache'
  cacheTag(METADATA_TAG)
  return JSON.parse(await readFile('ids.json', 'utf8'))
}

export async function imageMetadata(parent: string) {
  return ((await readIds()).images[parent] ?? []).map((id) => ({ id }))
}

export async function sitemapMetadata() {
  return (await readIds()).sitemaps.map((id) => ({ id }))
}
