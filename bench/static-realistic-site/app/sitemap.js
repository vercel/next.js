import { list } from '@bench/data'
import { ALL_LOCALES, counts, locales } from '../lib/content.mjs'

const BASE = 'https://bench-static-realistic-site.example'

// Every product and article in every locale, with the other locales as
// alternates.
export default async function sitemap() {
  const c = counts()
  const [products, articles] = await Promise.all([
    list(`/index/products?n=${c.products}`),
    list(`/index/articles?n=${c.articles}`),
  ])
  const entries = []
  const add = (path, changeFrequency, priority) => {
    for (const locale of locales()) {
      entries.push({
        url: `${BASE}/${locale}${path}`,
        lastModified: '2026-01-01T00:00:00.000Z',
        changeFrequency,
        priority,
        alternates: {
          languages: Object.fromEntries(
            ALL_LOCALES.map((other) => [other, `${BASE}/${other}${path}`])
          ),
        },
      })
    }
  }
  add('', 'daily', 1)
  add('/about', 'yearly', 0.3)
  for (const id of products) add(`/products/${id}`, 'daily', 0.8)
  for (const slug of articles) add(`/articles/${slug}`, 'weekly', 0.6)
  return entries
}
