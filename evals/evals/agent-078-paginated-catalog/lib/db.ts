// lib/db.ts — Acme Product Data's metered query client. DO NOT MODIFY THIS FILE.
// It is owned by the vendor integration team. Every call is a billed query;
// one NDJSON line is appended to data/query-log.ndjson per call so the bill
// can be audited.
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface Product {
  sku: string
  name: string
  price: number
}

const DATA_FILE = join(process.cwd(), 'data', 'products.json')
const LOG_FILE = join(process.cwd(), 'data', 'query-log.ndjson')

function logBilledQuery(page: number) {
  appendFileSync(
    LOG_FILE,
    JSON.stringify({ query: 'catalog.page', page }) + '\n'
  )
}

function simulateLatency() {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

export async function dbQueryCatalogPage(page: number): Promise<Product[]> {
  logBilledQuery(page)
  await simulateLatency()
  const pages = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Record<
    string,
    Product[]
  >
  return pages[String(page)] ?? []
}
