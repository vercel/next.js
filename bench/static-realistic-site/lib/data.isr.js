// The data layer of the default configuration: `fetch` with
// `next: { revalidate, tags }`, so every response goes through the data
// cache and every page is an ISR page whose revalidation time comes from the
// requests it made. Nothing here is memoized with React `cache`: the layout,
// the page and `generateMetadata` each call `fetch` for the same URL, and
// Next.js deduplicates the requests.
//
// Without `BENCH_DATA_URL` the content is produced in process (no `fetch`,
// no data cache, pages without a revalidation time).
import { cache } from 'react'
import { handle } from './content.mjs'

// Without a data server: once per path and render, as a request would be.
const local = cache((path) => handle(path))

async function request(path, revalidate, tags) {
  const base = process.env.BENCH_DATA_URL
  if (!base) return local(path)
  const res = await fetch(base + path, { next: { revalidate, tags } })
  if (!res.ok) throw new Error(`data: ${res.status} for ${path}`)
  return res.json()
}

// Makes the prerendered output independent of I/O timing, so two builds
// produce the same bytes.
//
// Await everything a Server Component or `generateMetadata` awaits through
// `read()`, `params` included. The order and the chunking of a page's Flight
// rows follow the order in which its suspended components resume. With real
// I/O that is the order in which responses arrive, and whether a response
// needs I/O at all depends on what other pages put into the data cache
// before. `read()` holds every result back until no other read of the same
// render is in flight, and then hands all of them out at once, in the order
// they were asked for, in a task of its own. The work is the same (the same
// requests, cache reads and writes, and renders); only the moment a
// component resumes is aligned. Set BENCH_DATA_GATE=0 to resume each
// component as its data arrives (the output is then not reproducible).
const wave = cache(() => ({ pending: 0, waiting: [], scheduled: false }))

function release(w) {
  w.scheduled = false
  // A read that started in the meantime releases the wave when it is done.
  if (w.pending > 0) return
  const all = w.waiting
  w.waiting = []
  for (const entry of all) entry.settle()
}

export function read(value) {
  if (process.env.BENCH_DATA_GATE === '0') return value
  const w = wave()
  const entry = { settle: null }
  w.pending++
  w.waiting.push(entry)
  return new Promise((resolve, reject) => {
    const done = (settle) => {
      entry.settle = settle
      if (--w.pending === 0 && !w.scheduled) {
        w.scheduled = true
        setImmediate(release, w)
      }
    }
    Promise.resolve(value).then(
      (v) => done(() => resolve(v)),
      (e) => done(() => reject(e))
    )
  })
}

// For `generateStaticParams`.
export const list = (path) => request(path, 3600, ['index'])

export const getSite = (locale) =>
  read(request(`/site/${locale}`, 3600, ['site']))

export const getProduct = (locale, id) =>
  read(request(`/product/${locale}/${id}`, 600, ['products', `product:${id}`]))

// Not per locale: the pages of one product in every locale share the entry.
export const getReviews = (id) =>
  read(request(`/reviews/${id}`, 300, [`reviews:${id}`]))

export const getCatalog = (locale, category) =>
  read(request(`/catalog/${locale}/${category}`, 900, [`category:${category}`]))

export const getArticle = (locale, slug) =>
  read(
    request(`/article/${locale}/${slug}`, 3600, ['articles', `article:${slug}`])
  )

export const getDocsTree = (locale, product, version, size) =>
  read(
    request(`/docs-tree/${locale}/${product}/${version}?n=${size}`, 86400, [
      'docs',
    ])
  )

export const getDoc = (locale, product, version, section, topic) =>
  read(
    request(`/doc/${locale}/${product}/${version}/${section}/${topic}`, 86400, [
      'docs',
      `doc:${product}:${version}`,
    ])
  )

export const getSection = (name, locale, slug) =>
  read(request(`/section/${name}/${locale}/${slug}`, 1800, [`section:${name}`]))

// Read by a dynamic hole, which only exists with BENCH_CC=1.
export const getStock = (id) => read(request(`/stock/${id}`, 60, []))
