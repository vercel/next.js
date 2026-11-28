// The site's data layer under Cache Components: `use cache` functions with
// explicit arguments around the content generators of the sibling fixture
// (`bench/static-isr-site/lib/data.js`), so both fixtures render the same
// content.
//
// Every entry shared between pages (navigation, docs navigation, category
// facets) revalidates after an hour or more. The default cache handler
// drops entries older than their `revalidate` time by wall clock, so a
// shorter time would make a build regenerate them depending on timing.
import { cacheLife, cacheTag } from 'next/cache'
import * as data from '../../static-isr-site/lib/data'
import { int, rng } from '../../static-isr-site/lib/rng'

// Global navigation: read by the root layout, so one entry is shared by
// every page.
export async function getNavigation() {
  'use cache'
  cacheLife('days')
  cacheTag('navigation')
  return data.getNavigation()
}

// The docs sidebar: shared by every docs page.
export async function getDocsNavigation() {
  'use cache'
  cacheLife('days')
  cacheTag('navigation', 'docs')
  return data.getDocsNavigation()
}

// Filter facets of a category: shared by the listing pages of a category.
export async function getCategoryFacets(category) {
  'use cache'
  cacheLife('hours')
  cacheTag(`category:${category}`)
  const listing = await data.getListing(category, '1')
  return listing.facets
}

// Reviews have their own entry and lifetime. `getProduct` reads them, which
// nests one cache inside another.
export async function getReviews(id) {
  'use cache'
  cacheLife('hours')
  cacheTag(`reviews:${id}`)
  const product = await data.getProduct(id)
  return product.reviews
}

export async function getProduct(id) {
  'use cache'
  cacheLife('catalog')
  cacheTag('products', `product:${id}`)
  const product = await data.getProduct(id)
  const reviews = await getReviews(id)
  return { ...product, reviews }
}

export async function getArticle(slug) {
  'use cache'
  cacheLife('days')
  cacheTag('articles', `article:${slug}`)
  return data.getArticle(slug)
}

// Docs pages cache at component level (see app/docs); this entry serves
// their metadata.
export async function getDoc(path) {
  'use cache'
  cacheLife('weeks')
  cacheTag('docs', `doc:${path.join('/')}`)
  return data.getDoc(path)
}

export async function getListing(category, page) {
  'use cache'
  cacheLife('hours')
  cacheTag(`category:${category}`)
  const { facets: _facets, ...listing } = await data.getListing(category, page)
  return listing
}

// Live stock: too short-lived to prerender (`seconds` expires after a
// minute), so a component that reads it becomes a dynamic hole.
export async function getStock(id) {
  'use cache'
  cacheLife('seconds')
  const r = rng(`stock:${id}`)
  return {
    id: String(id),
    available: int(r, 0, 40),
    warehouse: ['Reno', 'Columbus', 'Rotterdam'][int(r, 0, 2)],
    shipsInDays: int(r, 1, 5),
  }
}
