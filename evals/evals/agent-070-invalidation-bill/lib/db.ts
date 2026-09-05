// lib/db.ts — the metered data-source client. DO NOT MODIFY THIS FILE.
// Every call is billed. One NDJSON line is appended to data/query-log.ndjson
// per query so the bill can be audited.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Product {
  slug: string
  name: string
  price: number
}

const DATA_FILE = join(process.cwd(), 'data', 'products.json')
const LOG_FILE = join(process.cwd(), 'data', 'query-log.ndjson')

function logQuery(query: string, slug: string | null) {
  appendFileSync(LOG_FILE, JSON.stringify({ query, slug }) + '\n')
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

export async function dbQueryAllProducts(): Promise<Product[]> {
  logQuery('all-products', null)
  await simulateLatency()
  return JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Product[]
}

export async function dbQueryProduct(slug: string): Promise<Product | null> {
  logQuery('product', slug)
  await simulateLatency()
  const products = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Product[]
  return products.find((p) => p.slug === slug) ?? null
}
