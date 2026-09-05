// lib/db.ts — owned by the data team. Do not modify this file.
//
// Thin typed access layer over the JSON files in data/. Every query appends
// one NDJSON line to data/query-log.ndjson so the data team can audit load.

import { readFile, appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export type Product = {
  slug: string
  name: string
  price: number
  description: string
}

export type User = {
  id: string
  name: string
  billingEmail: string
}

export type Promo = {
  headline: string
  code: string
}

const DATA_DIR = join(process.cwd(), 'data')

function pause(): Promise<void> {
  // Simulates stable query latency.
  return new Promise((resolve) => setTimeout(resolve, 50))
}

async function logQuery(query: string): Promise<void> {
  // performance.now() is monotonic and safe to read during prerendering.
  const line = JSON.stringify({ query, t: performance.now() }) + '\n'
  await appendFile(join(DATA_DIR, 'query-log.ndjson'), line, 'utf8')
}

async function readJson(file: string): Promise<unknown> {
  const raw = await readFile(join(DATA_DIR, file), 'utf8')
  return JSON.parse(raw)
}

export async function dbListProducts(): Promise<Product[]> {
  await logQuery('products.list')
  await pause()
  return (await readJson('products.json')) as Product[]
}

export async function dbGetProduct(slug: string): Promise<Product | null> {
  await logQuery('products.get:' + slug)
  await pause()
  const products = (await readJson('products.json')) as Product[]
  return products.find((p) => p.slug === slug) ?? null
}

export async function dbGetPromo(): Promise<Promo> {
  await logQuery('promo.current')
  await pause()
  return (await readJson('promo.json')) as Promo
}

export async function dbGetUser(userId: string): Promise<User | null> {
  await logQuery('users.get:' + userId)
  await pause()
  const users = (await readJson('users.json')) as User[]
  return users.find((u) => u.id === userId) ?? null
}
