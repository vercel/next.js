import { afterAll, afterEach, beforeAll, beforeEach, test } from 'vitest'
import {
  chromium,
  expect,
  type Browser,
  type Page,
  type Locator,
  type Route,
} from '@playwright/test'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'

// The harness restores this file after the agent finishes. Keep expected data
// here rather than importing the agent's potentially changed catalog.
const products = [
  { slug: 'trail-pack', name: 'Trail Pack', category: 'bags', price: 85 },
  { slug: 'ridge-pack', name: 'Ridge Pack', category: 'bags', price: 110 },
  { slug: 'camp-mug', name: 'Camp Mug', category: 'gear', price: 18 },
  { slug: 'summit-bottle', name: 'Summit Bottle', category: 'gear', price: 32 },
  { slug: 'wool-cap', name: 'Wool Cap', category: 'clothing', price: 28 },
]
const next = createRequire(import.meta.url).resolve('next/dist/bin/next')
let browser: Browser
let page: Page
let server: ChildProcess
let origin: string

async function respond(route: Route) {
  const params = new URL(route.request().url()).searchParams
  const q = (params.get('q') || '').toLowerCase()
  const category = params.get('category') || 'all'
  await route.fulfill({
    json: products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) &&
        (category === 'all' || p.category === category)
    ),
  })
}

beforeAll(async () => {
  const socket = createServer()
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const address = socket.address()
  if (!address || typeof address === 'string')
    throw new Error('No verification port')
  const port = address.port
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve()))
  )
  origin = `http://127.0.0.1:${port}`
  const env = {
    ...process.env,
    NEXT_EVAL_DIST_DIR: '.next-verify',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  execFileSync(process.execPath, [next, 'build'], {
    env,
    stdio: 'inherit',
    timeout: 180_000,
  })
  server = spawn(
    process.execPath,
    [next, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { env, stdio: 'inherit' }
  )
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null)
          throw new Error('Verification server exited')
        try {
          return (
            await fetch(`${origin}/products`, {
              signal: AbortSignal.timeout(1000),
            })
          ).status
        } catch {
          return 0
        }
      },
      { timeout: 30_000 }
    )
    .toBe(200)
  browser = await chromium.launch()
}, 240_000)

beforeEach(async () => {
  page = await browser.newPage()
  page.setDefaultTimeout(5000)
  await page.route('**/api/products?*', respond)
  await page.goto(`${origin}/products`)
  await expect(
    page.getByRole('link', { name: 'Trail Pack', exact: true })
  ).toBeVisible()
})

afterEach(async () => {
  await page?.context().close()
})
afterAll(async () => {
  await browser?.close()
  server?.kill('SIGTERM')
})

test('the real catalog API keeps the data and filters', async () => {
  const all = await fetch(`${origin}/api/products?q=&category=all`)
  expect(all.status).toBe(200)
  const catalog = await all.json()
  expect(catalog).toHaveLength(products.length)
  expect(catalog).toEqual(expect.arrayContaining(products))
  const filtered = await fetch(`${origin}/api/products?q=pack&category=bags`)
  expect(filtered.status).toBe(200)
  const matches = await filtered.json()
  expect(matches).toHaveLength(2)
  expect(matches).toEqual(expect.arrayContaining(products.slice(0, 2)))
  const empty = await fetch(`${origin}/api/products?q=pack&category=gear`)
  expect(empty.status).toBe(200)
  expect(await empty.json()).toEqual([])
})

test('search stays usable and focused while results load', async () => {
  let pending: Route | undefined
  await page.route('**/api/products?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'pack')
      pending = route
    else await respond(route)
  })
  const search = page.getByRole('textbox', { name: 'Search products' })
  await search.fill('pack')
  await expect.poll(() => Boolean(pending)).toBe(true)
  await expect(search).toBeFocused()
  await expect(search).toBeEditable()
  await expect(page.getByRole('combobox', { name: 'Category' })).toBeEnabled()
  await expect(
    page
      .locator('[role="status"], [aria-live="polite"]')
      .filter({ hasText: /loading|searching|updating/i })
      .first()
  ).toBeVisible()
  await respond(pending!)
  await expect(
    page.getByRole('link', { name: 'Ridge Pack', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Camp Mug', exact: true })
  ).toHaveCount(0)
  await expect(search).toBeFocused()
})

test('an older response cannot replace the latest search', async () => {
  let older: Route | undefined
  let newer: Route | undefined
  await page.route('**/api/products?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')
    if (q === 'p') older = route
    else if (q === 'mug') newer = route
    else await respond(route)
  })
  const search = page.getByRole('textbox', { name: 'Search products' })
  await search.fill('p')
  await expect.poll(() => Boolean(older)).toBe(true)
  await search.fill('mug')
  await expect.poll(() => Boolean(newer)).toBe(true)
  await respond(newer!)
  await expect(
    page.getByRole('link', { name: 'Camp Mug', exact: true })
  ).toBeVisible()
  // Cancellation and ignoring outdated results are both valid solutions.
  await respond(older!).catch(() => {})
  await expect(search).toHaveValue('mug')
  // Check after the older response has had an opportunity to render.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(
    page.getByRole('link', { name: 'Trail Pack', exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Camp Mug', exact: true })
  ).toBeVisible()
})

test('empty results are announced and the next search still works', async () => {
  const search = page.getByRole('textbox', { name: 'Search products' })
  await search.fill('no-such-product')
  await expect(
    page
      .locator('[role="status"], [aria-live="polite"]')
      .filter({
        hasText:
          /no products|no results|no matches|no items|nothing|empty|0 products|0 results/i,
      })
      .first()
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Trail Pack', exact: true })
  ).toHaveCount(0)
  await search.fill('mug')
  await expect(
    page.getByRole('link', { name: 'Camp Mug', exact: true })
  ).toBeVisible()
})

test('a failed request can be retried without losing the selection', async () => {
  let fail = true
  let attempts = 0
  await page.route('**/api/products?*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('q') === 'pack' && params.get('category') === 'bags') {
      attempts++
      if (fail) {
        await route.fulfill({
          status: 503,
          json: { error: 'Catalog unavailable' },
        })
        return
      }
    }
    await respond(route)
  })
  await page.getByRole('combobox', { name: 'Category' }).selectOption('bags')
  await page.getByRole('textbox', { name: 'Search products' }).fill('pack')
  await expect(
    page
      .locator(
        '[role="alert"], [aria-live="assertive"], [role="status"], [aria-live="polite"]'
      )
      .filter({
        hasText:
          /error|failed|unavailable|couldn.t|went wrong|trouble|unable|cannot|can.t|sorry|problem/i,
      })
      .first()
  ).toBeVisible()
  fail = false
  await page.getByRole('button', { name: /retry|try again/i }).click()
  await expect.poll(() => attempts).toBeGreaterThanOrEqual(2)
  await expect(
    page.getByRole('link', { name: 'Trail Pack', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Search products' })
  ).toHaveValue('pack')
  await expect(page.getByRole('combobox', { name: 'Category' })).toHaveValue(
    'bags'
  )
})

async function tabTo(target: Locator) {
  await expect(target).toBeVisible()
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement))
      return
  }
  await expect(target).toBeFocused()
}

test('keyboard browsing preserves search and category through a product visit', async () => {
  const search = page.getByRole('textbox', { name: 'Search products' })
  await search.focus()
  await page.keyboard.type('pack')
  await expect(
    page.getByRole('link', { name: 'Ridge Pack', exact: true })
  ).toBeVisible()
  const category = page.getByRole('combobox', { name: 'Category' })
  await tabTo(category)
  await page.keyboard.press('b')
  await page.keyboard.press('Enter')
  await expect(category).toHaveValue('bags')
  await tabTo(page.getByRole('link', { name: 'Trail Pack', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Trail Pack' })).toBeVisible()
  const back = page.getByRole('link', { name: 'Back to products' })
  await back.focus()
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('pack')
  await expect(category).toHaveValue('bags')
  await expect(
    page.getByRole('link', { name: 'Ridge Pack', exact: true })
  ).toBeVisible()
})
