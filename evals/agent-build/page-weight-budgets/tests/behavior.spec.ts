import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const baseGit = process.env.EVAL_BASE_GIT ?? '/opt/eval/base.git'
const base = process.env.EVAL_BASE_URL ?? 'http://127.0.0.1:3010'
type Product = {
  slug: string
  name: string
  category: string
  price: number
  rating: number
  summary: string
  description: string
  specs: Record<string, string>
  featured: boolean
  reviews: { title: string }[]
  gallery: string[]
}
// The catalog the fixture ships, read from the baseline so edits cannot change it.
const catalog: Product[] = JSON.parse(
  execFileSync('git', ['--git-dir', baseGit, 'show', 'HEAD:lib/catalog.json'], {
    encoding: 'utf8',
    maxBuffer: 1 << 24,
  })
)
// The verifier adds this product before building (before-build.sh).
const later: Product = JSON.parse(
  readFileSync(join(__dirname, 'later/product.json'), 'utf8')
)
catalog.push(later)
const price = (p: number) => `$${p.toFixed(2)}`
const KB = 1024
const budgets: [string, number, number, number][] = [
  ['/', 80, 600, 200],
  ['/products', 320, 600, 200],
  ['/about', 40, 600, 200],
  ...[
    'day-pack-9',
    'ridge-tent-1',
    'cot-48',
    'rain-shell-17',
    'ridgeline-overnight-pack-49',
  ].map(
    (s) => [`/products/${s}`, 80, 600, 200] as [string, number, number, number]
  ),
]

async function weigh(page: Page, path: string) {
  const bytes = { document: 0, script: 0, image: 0 }
  const pending: Promise<void>[] = []
  page.on('response', (res) => {
    const type = res.request().resourceType()
    if (type !== 'document' && type !== 'script' && type !== 'image') return
    pending.push(
      res.body().then(
        (b) => {
          bytes[type] += b.length
        },
        () => {}
      )
    )
  })
  await page.goto(base + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await Promise.all(pending)
  return bytes
}

for (const [path, html, js, images] of budgets) {
  test(`budget ${path}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const bytes = await weigh(await context.newPage(), path)
    await context.close()
    expect(bytes.document / KB, `${path} HTML KB`).toBeLessThanOrEqual(html)
    expect(bytes.script / KB, `${path} JavaScript KB`).toBeLessThanOrEqual(js)
    expect(bytes.image / KB, `${path} image KB`).toBeLessThanOrEqual(images)
  })
}

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox()
  return b ? [Math.round(b.width), Math.round(b.height)] : null
}

async function imagesLoaded(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...document.images].filter(
              (i) => i.offsetParent && !(i.complete && i.naturalWidth > 0)
            ).length
        ),
      { timeout: 15_000 }
    )
    .toBe(0)
}

test.use({ viewport: { width: 1280, height: 800 } })

test('home keeps its content, layout, and interactions', async ({ page }) => {
  await page.goto(`${base}/`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Gear for the long way round' })
  ).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Hikers on a ridge at sunrise' })
  ).toBeVisible()
  expect(await box(page, 'main img')).toEqual([1176, 420])
  const featured = page
    .getByRole('list', { name: 'Featured products' })
    .getByRole('listitem')
  const expected = catalog.filter((p) => p.featured)
  await expect(featured).toHaveCount(expected.length)
  for (const p of expected) {
    const card = featured.filter({ hasText: p.name })
    await expect(card.getByText(price(p.price))).toBeVisible()
    await expect(card.getByRole('img', { name: p.name })).toBeVisible()
    await expect(
      card.getByRole('img', { name: `${p.rating} out of 5` })
    ).toBeVisible()
  }
  expect(await box(page, '[aria-label="Featured products"] li img')).toEqual([
    280, 280,
  ])
  for (const c of [...new Set(catalog.map((p) => p.category))])
    await expect(page.getByRole('link', { name: c, exact: true })).toBeVisible()
  await imagesLoaded(page)
  await page.getByLabel('Email').fill('hiker@example.com')
  await page.getByRole('button', { name: 'Subscribe' }).click()
  await expect(page.getByRole('status')).toHaveText('Thanks for subscribing!')
})

test('catalog keeps every product, filtering, sorting, and saving', async ({
  page,
}) => {
  await page.goto(`${base}/products`)
  const cards = page
    .getByRole('list', { name: 'Products' })
    .getByRole('listitem')
  await expect(cards).toHaveCount(catalog.length)
  for (const p of catalog) {
    const card = cards.filter({
      has: page.getByRole('heading', { name: p.name, exact: true }),
    })
    await expect(card.getByText(price(p.price))).toHaveCount(1)
    await expect(card.getByRole('link').first()).toHaveAttribute(
      'href',
      `/products/${p.slug}`
    )
  }
  expect(await box(page, '[aria-label="Products"] li img')).toEqual([280, 280])
  await imagesLoaded(page)
  await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'Packs' })
    .click()
  const packs = catalog.filter((p) => p.category === 'Packs').map((p) => p.name)
  await expect(cards).toHaveCount(packs.length)
  expect((await cards.getByRole('heading').allInnerTexts()).sort()).toEqual(
    [...packs].sort()
  )
  await page.getByLabel('Sort').selectOption('price-asc')
  const prices = (await cards.locator('.price').allInnerTexts()).map((t) =>
    Number(t.replace('$', ''))
  )
  expect(prices).toEqual([...prices].sort((a, b) => a - b))
  await page
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'All' })
    .click()
  await expect(cards).toHaveCount(catalog.length)
  const save = page.getByRole('button', { name: `Save ${catalog[3].name}` })
  await expect(save).toHaveAttribute('aria-pressed', 'false')
  await save.click()
  await expect(save).toHaveAttribute('aria-pressed', 'true')
})

test('product pages keep content, gallery, reviews, and cart', async ({
  page,
}) => {
  const p = catalog.find((x) => x.slug === 'day-pack-9')!
  await page.goto(`${base}/products/${p.slug}`)
  await expect(
    page.getByRole('heading', { level: 1, name: p.name })
  ).toBeVisible()
  await expect(page.getByText(p.summary)).toBeVisible()
  await expect(page.getByText(p.description.split('\n\n')[2])).toBeVisible()
  for (const [k, v] of Object.entries(p.specs))
    await expect(page.getByRole('row', { name: `${k} ${v}` })).toBeVisible()
  await expect(
    page.getByRole('img', { name: `${p.rating} out of 5` })
  ).toBeVisible()
  expect(await box(page, '.product img')).toEqual([560, 560])
  const main = page.getByRole('img', { name: p.name, exact: true })
  // The photo, whatever format or size variant serves it.
  const file = (s: string) => decodeURIComponent(s).match(/item-\d+/)?.[0]
  expect(file((await main.getAttribute('src'))!)).toBe(file(p.gallery[0]))
  await page.getByRole('button', { name: 'Show photo 3' }).click()
  await expect
    .poll(async () => file((await main.getAttribute('src'))!))
    .toBe(file(p.gallery[2]))
  const reviews = page
    .getByRole('region', { name: 'Reviews' })
    .getByRole('listitem')
  await expect(reviews).toHaveCount(3)
  await page
    .getByRole('button', { name: `Show all ${p.reviews.length} reviews` })
    .click()
  await expect(reviews).toHaveCount(p.reviews.length)
  await expect(page.getByText(p.reviews[19].title)).toBeVisible()
  await expect(page.getByTestId('cart-count')).toHaveText(/0/)
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByRole('status')).toHaveText('Added to your cart')
  await expect(page.getByTestId('cart-count')).toHaveText(/1/)
  const next = page
    .getByRole('region', { name: 'You may also like' })
    .getByRole('link')
    .first()
  const others = catalog
    .filter((x) => x.category === p.category && x.slug !== p.slug)
    .slice(0, 4)
    .map((x) => x.name)
  expect(
    await page
      .getByRole('region', { name: 'You may also like' })
      .getByRole('link')
      .allInnerTexts()
  ).toEqual(others)
  await next.click()
  await expect(
    page.getByRole('heading', { level: 1, name: others[0] })
  ).toBeVisible()
  await expect(page.getByTestId('cart-count')).toHaveText(/1/)
  await imagesLoaded(page)
})

test('a product added later works like the others', async ({ page }) => {
  await page.goto(`${base}/products/${later.slug}`)
  await expect(
    page.getByRole('heading', { level: 1, name: later.name })
  ).toBeVisible()
  expect(await box(page, '.product img')).toEqual([560, 560])
  await imagesLoaded(page)
  await page.goto(`${base}/products`)
  await expect(
    page.getByRole('heading', { name: later.name, exact: true })
  ).toBeVisible()
  await imagesLoaded(page)
})

test('about keeps the team', async ({ page }) => {
  await page.goto(`${base}/about`)
  for (const name of [
    'Mara Lindqvist',
    'Tomás Reyes',
    'Priya Natarajan',
    'Jun Park',
  ]) {
    await expect(page.getByRole('img', { name })).toBeVisible()
  }
  expect(await box(page, '.team img')).toEqual([240, 240])
  await imagesLoaded(page)
})
