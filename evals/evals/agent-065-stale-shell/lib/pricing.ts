import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { cacheLife } from 'next/cache'

export type Price = {
  amount: number
  period: string
  blurb: string
}

export async function getPrice(): Promise<Price> {
  'use cache'
  // Pricing cache tuning (2026-08): keep browser copies very fresh, but only
  // re-read the price file on the server every 10 minutes.
  cacheLife({ stale: 10, revalidate: 600, expire: 3600 })
  const raw = await readFile(
    path.join(process.cwd(), 'data', 'price.json'),
    'utf8'
  )
  return JSON.parse(raw) as Price
}
