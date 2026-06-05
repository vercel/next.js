// Deterministic, no-network data layer backed by a JSON file. Every reader does
// REAL async file I/O (fs.readFile) — which Cache Components treats as dynamic —
// so an uncached read outside <Suspense> / 'use cache' is a build error. None of
// these touch request context, so all are safe to wrap in 'use cache'.
import { promises as fs } from 'node:fs'
import path from 'node:path'

type Db = {
  products: { id: string; name: string; price: number }[]
  posts: { slug: string; title: string; body: string }[]
  comments: Record<string, { id: number; text: string }[]>
}

async function readDb(): Promise<Db> {
  const file = path.join(process.cwd(), 'data', 'db.json')
  return JSON.parse(await fs.readFile(file, 'utf8')) as Db
}

export async function getProducts() {
  return (await readDb()).products
}

export async function getAllPostSlugs() {
  return (await readDb()).posts.map((p) => p.slug)
}

export async function getPost(slug: string) {
  return (await readDb()).posts.find((p) => p.slug === slug) ?? null
}

export async function getComments(slug: string) {
  return (await readDb()).comments[slug] ?? []
}

export async function searchProducts(q: string) {
  const products = (await readDb()).products
  return q
    ? products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    : products
}

// Pretend dashboard data keyed by a "user" derived from a request cookie.
export async function getUserStats(userId: string) {
  return { userId, visits: userId.length * 7 }
}
