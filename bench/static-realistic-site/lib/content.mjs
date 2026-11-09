// The site's content, as a function of the request path. Everything is
// derived from the path with a seeded PRNG: no clock, no randomness.
//
// Two callers share this module so that both produce the same pages:
// `data-server.mjs` serves `handle(path)` as JSON over HTTP (the "CMS" the
// build fetches from), and the data layers call `handle(path)` directly when
// `BENCH_DATA_URL` is not set (no network, no data cache).
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
} from './rng.mjs'

const env = (name, dflt) => {
  const v = Number(process.env[name])
  return Number.isFinite(v) && process.env[name] !== '' && v >= 0 ? v : dflt
}

export const ALL_LOCALES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'pt',
  'sv',
  'ja',
  'ko',
]

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

export const DOC_PRODUCTS = ['platform', 'cli', 'sdk']
export const DOC_VERSIONS = ['v3', 'v2']
const TOPICS_PER_SECTION = 8

const BRANDS = ['Northfold', 'Halden', 'Oru', 'Kestrel', 'Miro', 'Tallis']
const COLORS = ['Slate', 'Moss', 'Sand', 'Ink', 'Rust', 'Fog']
const SIZES = ['XS', 'S', 'M', 'L', 'XL']
const AUTHORS = [
  'Ada Brandt',
  'Jonas Vale',
  'Mira Okafor',
  'Theo Lindqvist',
  'Priya Raman',
  'Sam Arroyo',
]

// The locales to prerender (`BENCH_LOCALES`, 1 to 10).
export function locales() {
  return ALL_LOCALES.slice(
    0,
    Math.max(1, Math.min(10, env('BENCH_LOCALES', 10)))
  )
}

// Names of the generated routes (`generate-routes.mjs` writes one route
// directory per name, the pages ask for their content by name).
export function sectionNames(n) {
  const r = rng('section-names')
  const seen = new Set()
  const out = []
  while (out.length < n) {
    const name = words(r, 2).join('-')
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

// How many pages of each template to prerender. Read at call time so one
// compiled build can be generated at several sizes.
//
// `BENCH_PAGES` is the number of product, article and docs pages together
// and `BENCH_MIX` their shares in percent. On top come the pages of the
// generated routes (`BENCH_PAGES_PER_ROUTE` each), the category listings
// (one per category and locale, at most 5% of `BENCH_PAGES`), the home,
// about and docs index pages of every locale, and the metadata routes.
//
// Every `generateStaticParams` call returns at least one page, which
// `cacheComponents` requires, so every template and every generated route
// has at least one page per locale.
export function counts() {
  const total = Math.max(40, env('BENCH_PAGES', 4000))
  const mix = (process.env.BENCH_MIX || '50,20,30').split(',').map(Number)
  const L = locales().length
  const perLocale = (share) =>
    Math.max(1, Math.floor((total * share) / 100 / L))
  return {
    total,
    locales: L,
    // per locale
    products: perLocale(mix[0]),
    articles: perLocale(mix[1]),
    docs: perLocale(mix[2]),
    categories: Math.max(
      1,
      Math.min(CATEGORIES.length, Math.floor((total * 0.05) / L))
    ),
    // per generated route, dealt out to the locales in turn
    perRoute: Math.max(L, env('BENCH_PAGES_PER_ROUTE', 10)),
  }
}

const img = (seed, i, alt, width = 640, height = 640) => ({
  src: `/img/${seed}-${i}.jpg`,
  alt,
  width,
  height,
})

// ---------------------------------------------------------------- prose
// A document is a list of blocks (what a Markdown or rich-text CMS field
// becomes). `bytes` is the size of the HTML the blocks should render to,
// approximately.
function prose(r, bytes, linkBase) {
  const blocks = []
  let size = 0
  let n = 0
  while (size < bytes) {
    const k = n++ % 16
    let block
    if (k === 0) {
      const text = title(r, int(r, 2, 5))
      block = { t: 'h2', id: `s${n}`, text }
      size += 60 + text.length
    } else if (k === 8) {
      const text = title(r, int(r, 2, 5))
      block = { t: 'h3', id: `s${n}`, text }
      size += 60 + text.length
    } else if (k === 5) {
      const items = Array.from({ length: int(r, 3, 6) }, () =>
        sentence(r, 6, 14)
      )
      block = { t: 'ul', items }
      size += items.reduce((a, s) => a + s.length + 9, 9)
    } else if (k === 10) {
      const lines = Array.from(
        { length: int(r, 6, 14) },
        (_, i) =>
          `${i % 3 === 0 ? 'const' : '  await'} ${words(r, 3).join('.')}(${int(r, 1, 99)})`
      )
      block = {
        t: 'code',
        lang: pick(r, ['js', 'ts', 'sh']),
        text: lines.join('\n'),
      }
      size += block.text.length * 2 + 120
    } else if (k === 12) {
      block = { t: 'quote', text: paragraph(r, 2, 3), cite: pick(r, AUTHORS) }
      size += block.text.length + 80
    } else if (k === 14) {
      const alt = capitalize(words(r, 5).join(' '))
      block = {
        t: 'img',
        ...img('content', int(r, 0, 9999), alt, 1200, 675),
        caption: sentence(r),
      }
      size += 900
    } else if (k === 15) {
      const head = Array.from({ length: 4 }, () =>
        capitalize(pick(r, words(r, 1)))
      )
      const rows = Array.from({ length: int(r, 4, 8) }, () =>
        Array.from({ length: 4 }, () => words(r, 2).join(' '))
      )
      block = { t: 'table', head, rows }
      size += 60 + rows.length * 110
    } else {
      // A paragraph is a list of runs; every third one carries a link and
      // some inline markup.
      const text = paragraph(r, 3, 6)
      if (k % 3 === 1) {
        const cut = Math.floor(text.length / 2)
        block = {
          t: 'p',
          runs: [
            { text: text.slice(0, cut) },
            {
              text: words(r, 3).join(' '),
              href: `${linkBase}/${words(r, 2).join('-')}`,
            },
            { text: text.slice(cut, cut + 40), em: true },
            { text: text.slice(cut + 40) },
            { text: words(r, 2).join('.'), code: true },
          ],
        }
        size += text.length + 160
      } else {
        block = { t: 'p', runs: [{ text }] }
        size += text.length + 7
      }
    }
    blocks.push(block)
  }
  return blocks
}

const headings = (blocks) =>
  blocks
    .filter((b) => b.t === 'h2' || b.t === 'h3')
    .map(({ t, id, text }) => ({ t, id, text }))

// ----------------------------------------------------------------- site
function site(locale) {
  const r = rng(`site:${locale}`)
  const links = env('BENCH_NAV_LINKS', 300)
  const groups = Math.max(1, Math.round((links * 0.8) / 12))
  const footerGroups = Math.max(1, Math.round((links * 0.2) / 12))
  const group = (base) => ({
    title: title(r, 2),
    links: Array.from({ length: 12 }, () => {
      const slug = words(r, 2).join('-')
      return {
        label: title(r, int(r, 1, 3)),
        href: `/${locale}${base}/${slug}`,
      }
    }),
  })
  return {
    locale,
    name: 'Northfold Supply',
    tagline: sentence(r, 5, 9),
    announcement: sentence(r, 8, 14),
    currency: [
      'USD',
      'EUR',
      'EUR',
      'EUR',
      'EUR',
      'EUR',
      'EUR',
      'SEK',
      'JPY',
      'KRW',
    ][Math.max(0, ALL_LOCALES.indexOf(locale))],
    categories: CATEGORIES.map((slug) => ({ slug, label: capitalize(slug) })),
    menu: Array.from({ length: groups }, (_, i) =>
      group(
        i % 3 === 0
          ? '/articles'
          : i % 3 === 1
            ? '/category'
            : '/docs/platform/v3'
      )
    ),
    footer: Array.from({ length: footerGroups }, () => group('/about')),
    social: ['github', 'x', 'youtube', 'mastodon'].map((name) => ({
      name,
      href: `https://${name}.example/northfold`,
    })),
  }
}

// -------------------------------------------------------------- products
function productSummary(locale, id) {
  const r = rng(`product:${id}`)
  const name = title(r, 3)
  const brand = pick(r, BRANDS)
  const price = int(r, 19, 899) + 0.99
  return {
    r,
    summary: {
      id: String(id),
      href: `/${locale}/products/${id}`,
      name,
      brand,
      category: CATEGORIES[Number(id) % CATEGORIES.length],
      price,
      compareAt: r() < 0.3 ? Math.round(price * 1.25) + 0.99 : null,
      rating: int(r, 30, 50) / 10,
      reviewCount: int(r, 3, 2400),
      image: img(`products/${id}`, 0, `${brand} ${name}`),
    },
  }
}

function product(locale, id) {
  const { r, summary } = productSummary(locale, id)
  const l = rng(`product:${locale}:${id}`)
  const variants = []
  for (const color of COLORS) {
    for (const size of SIZES) {
      variants.push({
        sku: `${summary.id}-${color.toLowerCase()}-${size.toLowerCase()}`,
        color,
        size,
        price: summary.price + (size === 'XL' ? 10 : 0),
        stock: int(r, 0, 40),
        weightGrams: int(r, 120, 2400),
        barcode: String(int(r, 1e11, 9e11)),
        attributes: {
          material: pick(r, ['wool', 'nylon', 'canvas', 'steel', 'ash']),
          origin: pick(r, ['PT', 'VN', 'IT', 'US', 'JP']),
          finish: words(r, 2).join(' '),
        },
      })
    }
  }
  return {
    ...summary,
    highlights: Array.from({ length: 5 }, () => sentence(l, 6, 12)),
    description: Array.from({ length: 4 }, () => paragraph(l)),
    specs: Array.from({ length: 14 }, () => ({
      label: title(l, 2),
      value: words(l, int(l, 1, 4)).join(' '),
    })),
    images: Array.from({ length: 8 }, (_, i) =>
      img(
        `products/${id}`,
        i,
        `${summary.brand} ${summary.name}, view ${i + 1}`
      )
    ),
    variants,
    sizeChart: {
      head: ['Size', 'Chest', 'Waist', 'Hip', 'Sleeve', 'Length', 'EU', 'UK'],
      rows: SIZES.concat(['XXL', '3XL', '4XL']).map((size) => [
        size,
        ...Array.from({ length: 7 }, () => `${int(r, 60, 140)} cm`),
      ]),
    },
    shipping: ALL_LOCALES.map((to) => ({
      to,
      days: int(r, 1, 9),
      price: int(r, 0, 25),
      carrier: pick(r, ['DHL', 'UPS', 'PostNord', 'Yamato']),
    })),
    related: Array.from(
      { length: 8 },
      (_, i) =>
        productSummary(locale, (Number(id) * 7 + i * 13 + 1) % 1000).summary
    ),
  }
}

function reviews(id) {
  const r = rng(`reviews:${id}`)
  return Array.from({ length: 8 }, (_, i) => ({
    id: `${id}-${i}`,
    title: capitalize(words(r, int(r, 2, 5)).join(' ')),
    rating: int(r, 3, 5),
    author: pick(r, AUTHORS),
    date: date(r),
    body: paragraph(r, 2, 5),
    helpful: int(r, 0, 120),
  }))
}

function catalog(locale, category) {
  const base = Math.max(0, CATEGORIES.indexOf(category))
  const r = rng(`catalog:${locale}:${category}`)
  return {
    category,
    title: capitalize(category),
    intro: paragraph(r, 2, 3),
    facets: ['Brand', 'Color', 'Size', 'Price'].map((name) => ({
      name,
      values: Array.from({ length: 6 }, () => ({
        label: title(r, 1),
        count: int(r, 1, 400),
      })),
    })),
    products: Array.from(
      { length: 24 },
      (_, i) => productSummary(locale, base + i * CATEGORIES.length).summary
    ),
  }
}

// -------------------------------------------------------------- articles
function article(locale, slug) {
  const r = rng(`article:${locale}:${slug}`)
  // The text is 18 to 180 KB at the default, most of it near the low end.
  // With the layout and the Flight data inlined into the document, that is
  // 100 to 500 KB of HTML.
  const u = r()
  const kb = env('BENCH_ARTICLE_KB', 60) * (0.3 + 2.7 * u * u)
  const blocks = prose(r, kb * 1000, `/${locale}/articles`)
  return {
    slug,
    title: title(r, int(r, 4, 8)),
    excerpt: paragraph(r, 2, 3),
    author: pick(r, AUTHORS),
    published: date(r),
    tags: words(r, 4),
    cover: img(
      `articles/${slug}`,
      0,
      capitalize(words(r, 4).join(' ')),
      1600,
      900
    ),
    headings: headings(blocks),
    blocks,
  }
}

// ------------------------------------------------------------------ docs
// Sections and topics of one product version, sized so that every locale
// gets `perLocale` docs pages in total.
function docsTree(locale, productName, version, perLocale) {
  const r = rng(`docs:${productName}:${version}`)
  const perVersion = Math.max(
    1,
    Math.floor(perLocale / (DOC_PRODUCTS.length * DOC_VERSIONS.length))
  )
  const sections = []
  for (let n = 0; n < perVersion; n += TOPICS_PER_SECTION) {
    const section = `${words(r, 1)[0]}-${sections.length}`
    sections.push({
      slug: section,
      title: title(r, 2),
      topics: Array.from(
        { length: Math.min(TOPICS_PER_SECTION, perVersion - n) },
        (_, i) => {
          const slug = `${words(r, 2).join('-')}-${i}`
          return {
            slug,
            title: title(r, int(r, 2, 4)),
            href: `/${locale}/docs/${productName}/${version}/${section}/${slug}`,
          }
        }
      ),
    })
  }
  return {
    product: productName,
    version,
    title: `${capitalize(productName)} ${version}`,
    sections,
  }
}

function docPage(locale, productName, version, section, topic) {
  const r = rng(`doc:${locale}:${productName}:${version}:${section}:${topic}`)
  const blocks = prose(
    r,
    env('BENCH_DOC_KB', 20) * 1000,
    `/${locale}/docs/${productName}/${version}`
  )
  return {
    title: title(r, int(r, 2, 5)),
    summary: paragraph(r, 1, 2),
    updated: date(r),
    headings: headings(blocks),
    blocks,
  }
}

// ----------------------------------------------------- generated routes
function sectionPage(name, locale, slug) {
  const r = rng(`section:${name}:${locale}:${slug}`)
  return {
    section: name,
    slug,
    title: title(r, int(r, 3, 6)),
    summary: paragraph(r, 1, 2),
    updated: date(r),
    cards: Array.from({ length: 6 }, (_, i) => ({
      title: title(r, 3),
      text: sentence(r),
      href: `/${locale}/s/${name}/${words(r, 2).join('-')}`,
      image: img(
        `sections/${name}`,
        i,
        capitalize(words(r, 3).join(' ')),
        800,
        450
      ),
    })),
    blocks: prose(r, env('BENCH_SECTION_KB', 8) * 1000, `/${locale}/s/${name}`),
  }
}

// Slugs of one generated route for one locale. A route has `perRoute` pages
// in total, dealt out to the locales in turn.
function sectionSlugs(name, index, locale, perRoute, L) {
  const r = rng(`section-slugs:${name}`)
  const at = Math.max(0, ALL_LOCALES.indexOf(locale))
  const out = []
  for (let j = 0; j < perRoute; j++) {
    const slug = `${words(r, 2).join('-')}-${j}`
    if ((index + j) % L === at) out.push(slug)
  }
  return out
}

// ------------------------------------------------------------- the router
// `path` is `/kind/a/b/...` with an optional `?n=` (a size, for the index
// endpoints that `generateStaticParams` reads).
export function handle(path) {
  const q = path.indexOf('?')
  const query = new URLSearchParams(q < 0 ? '' : path.slice(q + 1))
  const n = Number(query.get('n')) || 0
  const [kind, a, b, c, d, e] = (q < 0 ? path : path.slice(0, q))
    .slice(1)
    .split('/')
  switch (kind) {
    case 'site':
      return site(a)
    case 'product':
      return product(a, b)
    case 'reviews':
      return reviews(a)
    case 'catalog':
      return catalog(a, b)
    case 'stock': {
      const r = rng(`stock:${a}`)
      return {
        id: a,
        available: int(r, 0, 40),
        warehouse: pick(r, ['Reno', 'Columbus', 'Rotterdam']),
        shipsInDays: int(r, 1, 5),
      }
    }
    case 'article':
      return article(a, b)
    case 'docs-tree':
      return docsTree(a, b, c, n)
    case 'doc':
      return docPage(a, b, c, d, e)
    case 'section':
      return sectionPage(a, b, c)
    case 'index': {
      if (a === 'products')
        return Array.from({ length: n }, (_, i) => String(i))
      if (a === 'articles') {
        const r = rng('article-slugs')
        return Array.from(
          { length: n },
          (_, i) => `${words(r, 3).join('-')}-${i}`
        )
      }
      if (a === 'sections')
        return sectionSlugs(b, Number(c), d, n, Number(query.get('l')) || 1)
      break
    }
  }
  throw new Error(`content: no such path ${path}`)
}
