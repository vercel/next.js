'use server'

import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Product } from '@/lib/db'

const DATA_FILE = join(process.cwd(), 'data', 'products.json')

export async function saveProduct(formData: FormData) {
  const slug = String(formData.get('slug'))
  const name = String(formData.get('name'))
  const price = Number(formData.get('price'))

  const products = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Product[]
  const next = products.map((p) =>
    p.slug === slug ? { ...p, name, price } : p
  )
  const tmp = DATA_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(next, null, 2))
  renameSync(tmp, DATA_FILE)
}
