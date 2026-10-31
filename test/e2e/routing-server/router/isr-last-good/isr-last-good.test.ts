import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

// ISR is a production contract. The controlled regeneration origin is local
// to this test process, so a remote deployment cannot reach it.
// @force-gate start
describe('routing ISR failure and exact-path revalidation', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })
  const states = new Map<
    string,
    {
      value: string
      fail: boolean
      reads: number
      failures: number
      visits: number
    }
  >()
  const origin = createServer((req, res) => {
    const [, operation, slug] = req.url!.split('/')
    const state = states.get(slug)
    if (!state) {
      res.writeHead(404).end()
      return
    }
    if (operation === 'visit') {
      state.visits++
      res.end('ok')
      return
    }
    state.reads++
    if (state.fail) {
      state.failures++
      res.writeHead(503).end('intentional regeneration failure')
    } else {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ value: state.value }))
    }
  })

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      origin.once('error', reject)
      origin.listen(0, '127.0.0.1', resolve)
    })
    next.env.ROUTING_ISR_ORIGIN = `http://127.0.0.1:${(origin.address() as AddressInfo).port}`
    await next.start()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      origin.close((error) => (error ? reject(error) : resolve()))
    })
  })

  async function readPage(path: string) {
    const response = await next.fetch(path)
    expect(response.status).toBe(200)
    return cheerio
      .load(await response.text())('#value')
      .text()
  }

  it('serves the last successful page during failed regeneration, then recovers', async () => {
    const slug = randomUUID()
    const state = {
      value: 'first-' + slug,
      fail: false,
      reads: 0,
      failures: 0,
      visits: 0,
    }
    states.set(slug, state)
    const page = `/cached/${slug}`
    expect(await readPage(page)).toBe(state.value)

    state.fail = true
    await retry(async () => {
      expect(await readPage(page)).toBe('first-' + slug)
      expect(state.failures).toBeGreaterThan(0)
    })
    // A failed attempt must not replace the cached payload with an error or
    // partially generated result.
    expect(await readPage(page)).toBe('first-' + slug)

    state.value = 'recovered-' + slug
    state.fail = false
    await retry(async () => {
      expect(await readPage(page)).toBe(state.value)
    }, 15000)
    expect(state.reads).toBeGreaterThan(2)
  })

  it('revalidates the exact destination and bypasses Proxy rewrites', async () => {
    const slug = 'on-demand-' + randomUUID()
    const state = {
      value: 'initial-' + slug,
      fail: false,
      reads: 0,
      failures: 0,
      visits: 0,
    }
    states.set(slug, state)
    const source = `/article/${slug}`
    const destination = `/cached/${slug}`
    expect(await readPage(source)).toBe(state.value)

    state.value = 'updated-' + slug
    // Revalidating the public rewritten URL does not regenerate its target:
    // the on-demand request does not execute Proxy to discover that target.
    const sourceResult = await next.fetch('/api/revalidate', {
      method: 'POST',
      body: JSON.stringify({ path: source }),
      headers: { 'content-type': 'application/json' },
    })
    expect(sourceResult.status).toBe(200)
    expect(await sourceResult.json()).toEqual({ revalidated: false })
    expect(await readPage(source)).toBe('initial-' + slug)

    const visitsBeforeRevalidation = state.visits
    const result = await next.fetch('/api/revalidate', {
      method: 'POST',
      body: JSON.stringify({ path: destination }),
      headers: { 'content-type': 'application/json' },
    })
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ revalidated: true })
    expect(state.visits).toBe(visitsBeforeRevalidation)
    expect(await readPage(source)).toBe(state.value)
  })
})
