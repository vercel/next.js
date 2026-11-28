// The data layer under Cache Components (BENCH_CC=1): `use cache` functions
// with `cacheTag` and `cacheLife` around the same requests as
// `data.isr.js`, so both configurations render the same content.
//
// Every entry shared between pages (site, docs tree, catalog) revalidates
// after an hour or more: the default cache handler drops entries older than
// their `revalidate` time by wall clock, so a shorter time would make a
// build regenerate them depending on timing.
import { cacheLife, cacheTag } from 'next/cache'
import { handle } from './content.mjs'

async function request(path) {
  const base = process.env.BENCH_DATA_URL
  if (!base) return handle(path)
  const res = await fetch(base + path)
  if (!res.ok) throw new Error(`data: ${res.status} for ${path}`)
  return res.json()
}

// The default configuration needs this to make its output reproducible (see
// `data.isr.js`). Here a prerender reads every cache entry before its final
// render, so there is nothing to align.
export const read = (value) => value

// For `generateStaticParams`.
export const list = (path) => request(path)

export async function getSite(locale) {
  'use cache'
  cacheLife('days')
  cacheTag('site')
  return request(`/site/${locale}`)
}

export async function getProduct(locale, id) {
  'use cache'
  cacheLife('catalog')
  cacheTag('products', `product:${id}`)
  return request(`/product/${locale}/${id}`)
}

export async function getReviews(id) {
  'use cache'
  cacheLife('hours')
  cacheTag(`reviews:${id}`)
  return request(`/reviews/${id}`)
}

export async function getCatalog(locale, category) {
  'use cache'
  cacheLife('hours')
  cacheTag(`category:${category}`)
  return request(`/catalog/${locale}/${category}`)
}

export async function getArticle(locale, slug) {
  'use cache'
  cacheLife('days')
  cacheTag('articles', `article:${slug}`)
  return request(`/article/${locale}/${slug}`)
}

export async function getDocsTree(locale, product, version, size) {
  'use cache'
  cacheLife('weeks')
  cacheTag('docs')
  return request(`/docs-tree/${locale}/${product}/${version}?n=${size}`)
}

export async function getDoc(locale, product, version, section, topic) {
  'use cache'
  cacheLife('weeks')
  cacheTag('docs', `doc:${product}:${version}`)
  return request(`/doc/${locale}/${product}/${version}/${section}/${topic}`)
}

export async function getSection(name, locale, slug) {
  'use cache'
  cacheLife('hours')
  cacheTag(`section:${name}`)
  return request(`/section/${name}/${locale}/${slug}`)
}

// Live stock: too short-lived to prerender (`seconds` expires after a
// minute), so a component that reads it becomes a dynamic hole. Produced in
// process: with a request in here, the prerender reports "Unexpected cache
// miss after cache warming phase".
export async function getStock(id) {
  'use cache'
  cacheLife('seconds')
  return handle(`/stock/${id}`)
}
