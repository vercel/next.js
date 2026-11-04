import { expect, test } from 'vitest'
import { chromium, expect as browserExpect } from '@playwright/test'
import { createServer, type ServerResponse } from 'node:http'
import { randomUUID, randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

test('keeps Cache Components enabled', () => {
  expect(readFileSync('next.config.ts', 'utf8')).toMatch(
    /cacheComponents\s*:\s*true/
  )
})

test('streams the shell and each ready section without waiting for the others', async () => {
  const month = `Revenue-${randomUUID()}`
  const customer = `Customer-${randomUUID()}`
  const total = randomInt(100000, 999999)
  const payloads = {
    cards: { totalRevenue: total, totalInvoices: 24 },
    revenue: [{ month, amount: 12000 }],
    invoices: [{ id: '1', name: customer, amount: 500 }],
  }
  const pending = new Map<string, ServerResponse>()
  let allRequested!: () => void
  const requestsReady = new Promise<void>((resolve) => {
    allRequested = resolve
  })
  let hold = false
  const api = createServer((request, response) => {
    const section = request.url?.slice(1) as keyof typeof payloads
    if (!(section in payloads)) {
      response.writeHead(404).end()
      return
    }
    if (hold) {
      pending.set(section, response)
      if (pending.size === 3) allRequested()
    } else response.end(JSON.stringify(payloads[section]))
  })
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const address = api.address()
  if (!address || typeof address === 'string') throw new Error('No API address')
  const previousOrigin = process.env.DASHBOARD_API_URL
  process.env.DASHBOARD_API_URL = `http://127.0.0.1:${address.port}`
  let app: Awaited<ReturnType<typeof startNextServer>> | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const abort = new AbortController()
  try {
    await buildNextApp()
    app = await startNextServer()
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    hold = true
    const timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await page.goto(app.url, {
        waitUntil: 'commit',
        timeout: 15_000,
      })
      expect(response?.ok()).toBe(true)
      const cards = page.getByText(
        new RegExp(`^\\$(?:${total.toLocaleString('en-US')}|${total})$`)
      )
      const revenue = page.getByText(month)
      const invoices = page.getByText(customer)
      function release(section: keyof typeof payloads) {
        const request = pending.get(section)
        expect(request, `${section} must load independently`).toBeDefined()
        pending.delete(section)
        request!.end(JSON.stringify(payloads[section]))
      }
      await browserExpect(
        page.getByRole('heading', { name: 'Dashboard', exact: true })
      ).toBeVisible()
      await browserExpect(cards).not.toBeVisible()
      await browserExpect(revenue).not.toBeVisible()
      await browserExpect(invoices).not.toBeVisible()
      // Start all three requests without awaiting any section first.
      await Promise.race([
        requestsReady,
        new Promise<never>((_, reject) =>
          abort.signal.addEventListener(
            'abort',
            () => reject(new Error('Sections did not start independently')),
            { once: true }
          )
        ),
      ])
      expect([...pending.keys()].sort()).toEqual([
        'cards',
        'invoices',
        'revenue',
      ])
      release('cards')
      // React can send completed HTML in hidden segments before revealing it.
      // Require visible content while the other sections are still blocked.
      await browserExpect(cards).toBeVisible()
      await browserExpect(revenue).not.toBeVisible()
      await browserExpect(invoices).not.toBeVisible()
      release('revenue')
      await browserExpect(revenue).toBeVisible()
      await browserExpect(cards).toBeVisible()
      await browserExpect(invoices).not.toBeVisible()
      release('invoices')
      await browserExpect(invoices).toBeVisible()
      await browserExpect(cards).toBeVisible()
      await browserExpect(revenue).toBeVisible()
    } finally {
      clearTimeout(timer)
    }
  } finally {
    abort.abort()
    for (const response of pending.values()) response.end('{}')
    await browser?.close()
    await app?.stop()
    api.closeAllConnections()
    await new Promise<void>((resolve) => api.close(() => resolve()))
    if (previousOrigin === undefined) delete process.env.DASHBOARD_API_URL
    else process.env.DASHBOARD_API_URL = previousOrigin
  }
}, 240_000)
