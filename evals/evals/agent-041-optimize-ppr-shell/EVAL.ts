import { expect, test } from 'vitest'
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
  const abort = new AbortController()
  try {
    await buildNextApp()
    app = await startNextServer()
    hold = true
    const timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await fetch(app.url, { signal: abort.signal })
      expect(response.ok).toBe(true)
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let html = ''
      // Ignore Flight/script payloads: assert rendered content, not serialized data.
      const content = () =>
        html.replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, '')
      async function until(check: () => boolean) {
        while (!check()) {
          const chunk = await reader.read()
          if (chunk.done)
            throw new Error('Response ended before the expected content')
          html += decoder.decode(chunk.value, { stream: true })
        }
      }
      function release(section: keyof typeof payloads) {
        const request = pending.get(section)
        expect(request, `${section} must load independently`).toBeDefined()
        pending.delete(section)
        request!.end(JSON.stringify(payloads[section]))
      }
      await until(() => /<h1[^>]*>Dashboard<\/h1>/.test(content()))
      expect(content()).not.toContain(month)
      expect(content()).not.toContain(customer)
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
      await until(
        () =>
          content().includes(total.toLocaleString('en-US')) ||
          content().includes(String(total))
      )
      expect(content()).not.toContain(month)
      expect(content()).not.toContain(customer)
      release('revenue')
      await until(() => content().includes(month))
      expect(content()).not.toContain(customer)
      release('invoices')
      await until(() => content().includes(customer))
      await reader.cancel()
    } finally {
      clearTimeout(timer)
    }
  } finally {
    abort.abort()
    for (const response of pending.values()) response.end('{}')
    await app?.stop()
    api.closeAllConnections()
    await new Promise<void>((resolve) => api.close(() => resolve()))
    if (previousOrigin === undefined) delete process.env.DASHBOARD_API_URL
    else process.env.DASHBOARD_API_URL = previousOrigin
  }
}, 240_000)
