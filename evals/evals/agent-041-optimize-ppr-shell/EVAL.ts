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
  function waitForRequests() {
    return new Promise<void>((resolve) => {
      allRequested = resolve
    })
  }
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
  try {
    await buildNextApp()
    app = await startNextServer()
    browser = await chromium.launch({ headless: true })
    const sections = ['cards', 'revenue', 'invoices'] as const
    for (const first of sections) {
      const context = await browser.newContext()
      const abort = new AbortController()
      const requestsReady = waitForRequests()
      hold = true
      const timer = setTimeout(() => abort.abort(), 15_000)
      try {
        const page = await context.newPage()
        const response = await page.goto(app.url, {
          waitUntil: 'commit',
          timeout: 15_000,
        })
        expect(response?.ok()).toBe(true)
        const content = {
          cards: page.getByText(
            new RegExp(`^\\$(?:${total.toLocaleString('en-US')}|${total})$`)
          ),
          revenue: page.getByText(month),
          invoices: page.getByText(customer),
        }
        function release(section: keyof typeof payloads) {
          const request = pending.get(section)
          expect(request, `${section} must load independently`).toBeDefined()
          pending.delete(section)
          request!.end(JSON.stringify(payloads[section]))
        }
        await browserExpect(
          page.getByRole('heading', { name: 'Dashboard', exact: true })
        ).toBeVisible()
        for (const section of sections) {
          await browserExpect(content[section]).not.toBeVisible()
        }
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
        expect([...pending.keys()].sort()).toEqual([...sections].sort())
        release(first)
        // Every section must become visible with the other two still blocked.
        // HTML in React's hidden streaming segments does not count.
        await browserExpect(
          content[first],
          `${first} must reveal before the other sections are ready`
        ).toBeVisible()
        for (const section of sections) {
          if (section !== first) {
            await browserExpect(content[section]).not.toBeVisible()
            release(section)
          }
        }
        for (const section of sections) {
          await browserExpect(content[section]).toBeVisible()
        }
      } finally {
        clearTimeout(timer)
        abort.abort()
        hold = false
        for (const [section, response] of pending) {
          response.end(
            JSON.stringify(payloads[section as keyof typeof payloads])
          )
        }
        pending.clear()
        await context.close()
      }
    }
  } finally {
    for (const response of pending.values()) response.end('{}')
    await browser?.close()
    await app?.stop()
    api.closeAllConnections()
    await new Promise<void>((resolve) => api.close(() => resolve()))
    if (previousOrigin === undefined) delete process.env.DASHBOARD_API_URL
    else process.env.DASHBOARD_API_URL = previousOrigin
  }
}, 240_000)
