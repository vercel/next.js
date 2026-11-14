// The site's "CMS". Stands in for a remote content API: async accessors,
// request-deduplicated with React `cache`. Content is generated from the id,
// so nothing here touches the network or the disk.
//
// The accessors resolve without real I/O on purpose. With real I/O (`fetch`,
// `unstable_cache`, ...) the order and chunking of a page's Flight rows
// depend on I/O timing, so two builds of the same commit produce slightly
// different HTML and RSC payloads, and the byte-for-byte output comparison
// this fixture is used for would be meaningless.
import { cache } from 'react'
import {
  capitalize,
  date,
  int,
  paragraph,
  pick,
  rng,
  sentence,
  title,
  words,
} from './rng'

const DEFAULT_PAGES = 8000

export const CATEGORIES = [
  'audio',
  'bags',
  'bikes',
  'camping',
  'climbing',
  'cookware',
  'desks',
  'footwear',
  'garden',
  'jackets',
  'keyboards',
  'lighting',
  'luggage',
  'monitors',
  'optics',
  'running',
  'storage',
  'tools',
  'travel',
  'watches',
]

export const DOC_SECTIONS = [
  'getting-started',
  'accounts',
  'orders',
  'shipping',
  'returns',
  'payments',
  'warranty',
  'care-guides',
  'sizing',
  'sustainability',
  'wholesale',
  'api',
]

const BRANDS = ['Northfold', 'Halden', 'Oru', 'Kestrel', 'Miro', 'Tallis']
const COLORS = ['Slate', 'Moss', 'Sand', 'Ink', 'Rust', 'Fog', 'Clay', 'Pine']
const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const AUTHORS = [
  'Ada Brandt',
  'Jonas Vale',
  'Mira Okafor',
  'Theo Lindqvist',
  'Priya Raman',
  'Sam Arroyo',
]

// How many pages of each template to prerender. Read at call time (not at
// module scope) so one compiled build can be generated at several sizes.
export function counts() {
  const total = Math.max(40, Number(process.env.BENCH_PAGES) || DEFAULT_PAGES)
  const products = Math.floor(total * 0.5)
  const articles = Math.floor(total * 0.25)
  const docs = Math.floor(total * 0.15)
  const listings = total - products - articles - docs
  return { total, products, articles, docs, listings }
}

export const PRODUCTS_PER_LISTING = 24

function productCore(id) {
  const r = rng(`product:${id}`)
  const name = title(r, 3)
  const brand = pick(r, BRANDS)
  const category = CATEGORIES[Number(id) % CATEGORIES.length]
  const price = int(r, 19, 899) + 0.99
  const onSale = r() < 0.3
  return {
    r,
    summary: {
      id: String(id),
      name,
      brand,
      category,
      price,
      compareAt: onSale ? Math.round(price * 1.25) + 0.99 : null,
      rating: int(r, 30, 50) / 10,
      reviewCount: int(r, 3, 2400),
      image: {
        src: `/img/products/${id}-0.jpg`,
        alt: `${brand} ${name}`,
        width: 640,
        height: 640,
      },
    },
  }
}

export function getProductSummary(id) {
  return productCore(id).summary
}

export const getProduct = cache(async (id) => {
  const { r, summary } = productCore(id)
  const n = counts().products
  const base = Number(id)
  const images = [summary.image]
  for (let i = 1; i < 5; i++) {
    images.push({
      src: `/img/products/${id}-${i}.jpg`,
      alt: `${summary.brand} ${summary.name}, view ${i + 1}`,
      width: 640,
      height: 640,
    })
  }
  const variants = []
  for (const color of COLORS.slice(0, int(r, 2, 4))) {
    for (const size of SIZES.slice(0, int(r, 2, 4))) {
      variants.push({
        sku: `${id}-${color.toLowerCase()}-${size.toLowerCase()}`,
        color,
        size,
        inStock: r() > 0.15,
        priceDelta: int(r, 0, 3) * 5,
      })
    }
  }
  const specs = []
  for (let i = 0; i < 14; i++) {
    specs.push({ label: title(r, 2), value: words(r, int(r, 1, 4)).join(' ') })
  }
  const reviews = []
  for (let i = 0; i < 6; i++) {
    reviews.push({
      id: `${id}-r${i}`,
      author: pick(r, AUTHORS),
      rating: int(r, 3, 5),
      title: capitalize(words(r, int(r, 3, 6)).join(' ')),
      body: paragraph(r, 2, 4),
      date: date(r),
      helpful: int(r, 0, 120),
    })
  }
  const related = []
  for (let i = 1; i <= 8; i++) related.push(String((base + i * 7) % n))
  return {
    ...summary,
    images,
    variants,
    highlights: [sentence(r, 5, 9), sentence(r, 5, 9), sentence(r, 5, 9)],
    description: [paragraph(r), paragraph(r), paragraph(r)],
    specs,
    reviews,
    related,
  }
})

function buildArticle(slug) {
  const r = rng(`article:${slug}`)
  const sections = []
  for (let i = 0; i < 5; i++) {
    sections.push({
      id: `section-${i + 1}`,
      heading: capitalize(words(r, int(r, 3, 6)).join(' ')),
      paragraphs: [paragraph(r, 4, 7), paragraph(r, 4, 7), paragraph(r, 3, 5)],
      points: i % 2 === 0 ? [sentence(r, 4, 8), sentence(r, 4, 8)] : null,
    })
  }
  const n = counts().articles
  const index = Number(slug.slice(slug.lastIndexOf('-') + 1))
  const related = []
  for (let i = 1; i <= 4; i++) related.push(articleSlug((index + i * 3) % n))
  return {
    slug,
    title: capitalize(words(r, int(r, 5, 9)).join(' ')),
    excerpt: sentence(r, 14, 22),
    author: pick(r, AUTHORS),
    date: date(r),
    readingMinutes: int(r, 3, 14),
    tags: words(r, 4),
    cover: {
      src: `/img/articles/${slug}.jpg`,
      alt: sentence(r, 4, 7),
      width: 1200,
      height: 630,
    },
    sections,
    related,
  }
}

export function articleSlug(index) {
  return `field-notes-${index}`
}

export const getArticle = cache(async (slug) => buildArticle(slug))

export function getArticleTeaser(slug) {
  const r = rng(`article:${slug}:teaser`)
  return {
    slug,
    title: capitalize(words(r, int(r, 5, 9)).join(' ')),
    excerpt: sentence(r, 12, 18),
    date: date(r),
  }
}

export function docPath(index) {
  const section = DOC_SECTIONS[index % DOC_SECTIONS.length]
  return [section, `topic-${Math.floor(index / DOC_SECTIONS.length) + 1}`]
}

export const getDoc = cache(async (path) => {
  const key = path.join('/')
  const r = rng(`doc:${key}`)
  const sections = []
  for (let i = 0; i < 6; i++) {
    sections.push({
      id: `step-${i + 1}`,
      heading: capitalize(words(r, int(r, 2, 5)).join(' ')),
      paragraphs: [paragraph(r, 3, 5), paragraph(r, 2, 4)],
      code:
        i % 3 === 1
          ? words(r, 6)
              .map((w, n) => `const ${w}${n} = configure('${w}')`)
              .join('\n')
          : null,
    })
  }
  const topic = Number(path[1].slice(path[1].lastIndexOf('-') + 1))
  return {
    path,
    section: path[0],
    title: capitalize(words(r, int(r, 3, 6)).join(' ')),
    summary: sentence(r, 12, 20),
    updated: date(r),
    sections,
    previous: topic > 1 ? [path[0], `topic-${topic - 1}`] : null,
    next: [path[0], `topic-${topic + 1}`],
  }
})

// The docs sidebar: every section with its first topics. Shared by all docs
// pages and passed to a client component, as a real docs site does.
export const getDocsNavigation = cache(async () => {
  return DOC_SECTIONS.map((section) => {
    const r = rng(`docs-nav:${section}`)
    const topics = []
    for (let i = 1; i <= 8; i++) {
      topics.push({
        href: `/docs/${section}/topic-${i}`,
        label: capitalize(words(r, int(r, 2, 4)).join(' ')),
      })
    }
    return { section, label: title(rng(`section:${section}`), 2), topics }
  })
})

export const getListing = cache(async (category, page) => {
  const n = counts().products
  const r = rng(`listing:${category}:${page}`)
  const categoryIndex = CATEGORIES.indexOf(category)
  const products = []
  for (let i = 0; i < PRODUCTS_PER_LISTING; i++) {
    // Products of a category are the ids congruent to its index.
    const k = (Number(page) - 1) * PRODUCTS_PER_LISTING + i
    const id = (categoryIndex + k * CATEGORIES.length) % n
    products.push(getProductSummary(id))
  }
  return {
    category,
    page: Number(page),
    title: `${capitalize(category)} — page ${page}`,
    intro: paragraph(r, 2, 3),
    products,
    facets: {
      brands: BRANDS.map((brand) => ({ value: brand, count: int(r, 1, 80) })),
      colors: COLORS.map((color) => ({ value: color, count: int(r, 1, 60) })),
      sizes: SIZES.map((size) => ({ value: size, count: int(r, 1, 90) })),
      price: { min: 19, max: 899 },
    },
  }
})

// Global navigation, rendered by the root layout on every page.
export const getNavigation = cache(async () => {
  return {
    menus: CATEGORIES.slice(0, 6).map((category) => {
      const r = rng(`menu:${category}`)
      const links = []
      for (let i = 1; i <= 6; i++) {
        links.push({
          href: `/category/${category}/${i}`,
          label: title(r, 2),
        })
      }
      return { category, label: capitalize(category), links }
    }),
    footer: ['Shop', 'Support', 'Company', 'Legal'].map((heading) => {
      const r = rng(`footer:${heading}`)
      const links = []
      for (let i = 0; i < 6; i++) {
        links.push({
          href: `/docs/${pick(r, DOC_SECTIONS)}/topic-${int(r, 1, 8)}`,
          label: title(r, 2),
        })
      }
      return { heading, links }
    }),
  }
})
