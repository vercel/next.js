import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type RequestInsight = {
  requestId: string
  parentRequestId?: string
  parentFetchIndex?: number
  url?: string
  source?: string
  routerActivity?: string
  serverAction?: true
  fetches: Array<{
    index?: number
    method: string
    statusCode?: number
    url: string
  }>
}

describe('Request Insights Edge bridge', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function snapshot(): Promise<RequestInsight[]> {
    return next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())
      .then((value) => value.requests)
  }

  async function captureNewRequests(run: () => Promise<unknown>) {
    const previous = new Set(
      (await snapshot()).map((request) => request.requestId)
    )
    await run()
    let requests: RequestInsight[] = []
    await retry(async () => {
      requests = (await snapshot()).filter(
        (request) => !previous.has(request.requestId)
      )
      expect(requests.length).toBeGreaterThan(0)
    })
    return requests
  }

  it('records and causally links same-origin Edge route fetches', async () => {
    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/api/edge-causal/one')
      expect(await response.json()).toEqual({
        causalCookieVisible: false,
        step: 'two',
      })
    })
    const parent = requests.find(
      (request) => request.url === '/api/edge-causal/one'
    )
    const child = requests.find(
      (request) => request.url === '/api/edge-causal/two'
    )

    expect(parent).toEqual(expect.objectContaining({ source: 'app-route' }))
    expect(child).toEqual(
      expect.objectContaining({ parentRequestId: parent?.requestId })
    )
    expect(
      parent?.fetches.some(
        (fetch) =>
          fetch.url.includes('/api/edge-causal/two') &&
          fetch.index === child?.parentFetchIndex
      )
    ).toBe(true)
  })

  it('preserves an Edge streaming POST body and records the child request', async () => {
    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/api/edge-causal/one', {
        method: 'POST',
        body: 'streamed body',
      })
      expect(await response.json()).toEqual({
        body: 'streamed body',
        causalCookieVisible: false,
        step: 'two',
      })
    })
    const parent = requests.find(
      (request) => request.url === '/api/edge-causal/one'
    )
    expect(parent?.fetches).toEqual([
      expect.objectContaining({ method: 'POST', statusCode: 200 }),
    ])
  })

  it('records failed external Edge fetches without forwarding reserved cookies', async () => {
    const receivedCookies: Array<string | undefined> = []
    const server = createServer((request, response) => {
      receivedCookies.push(request.headers.cookie)
      request.socket.destroy()
      response.destroy()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const target = `http://127.0.0.1:${address.port}/abort`
      const requests = await captureNewRequests(async () => {
        const response = await next.fetch(
          `/api/edge-causal/external?target=${encodeURIComponent(target)}`
        )
        expect(response.status).toBe(502)
      })
      const parent = requests.find((request) =>
        request.url?.startsWith('/api/edge-causal/external')
      )
      expect(parent?.fetches).toEqual([
        expect.objectContaining({ url: target }),
      ])
      expect(parent?.fetches[0].statusCode).toBeUndefined()
      expect(receivedCookies).toEqual(['user=value'])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('records Edge middleware fetches on the page request', async () => {
    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/edge-proxy')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('proxy-fetch-status">200')
    })
    const page = requests.find(
      (request) => request.url === '/edge-proxy' && request.fetches.length > 0
    )
    const child = requests.find(
      (request) => request.url === '/api/edge-causal/proxy'
    )

    expect(page?.fetches).toEqual([
      expect.objectContaining({ statusCode: 200 }),
    ])
    expect(child?.parentRequestId).toBe(page?.requestId)
  })

  it('classifies successful Edge Server Actions without retaining action IDs', async () => {
    const previous = new Set(
      (await snapshot()).map((request) => request.requestId)
    )
    const actionIds: string[] = []
    const browser = await next.browser('/edge-action', {
      beforePageLoad(page) {
        page.route('**/edge-action**', async (route) => {
          const actionId = (await route.request().allHeaders())['next-action']
          if (actionId) actionIds.push(actionId)
          await route.continue()
        })
      },
    })
    await browser.elementByCss('#run-edge-action').click()
    await retry(async () => {
      expect(await browser.eval(() => document.cookie)).toContain(
        'edge-action=complete'
      )
    })

    await retry(async () => {
      const requests = (await snapshot()).filter(
        (request) => !previous.has(request.requestId)
      )
      expect(
        requests.find(
          (request) =>
            request.url === '/edge-action' && request.serverAction === true
        )
      ).toBeDefined()
      expect(actionIds).toHaveLength(1)
      expect(JSON.stringify(requests)).not.toContain(actionIds[0])
      expect(JSON.stringify(requests)).not.toContain('next-action')
    })
  })

  it('does not classify a forged action header on an Edge App Route', async () => {
    const forgedActionId = '00'.repeat(21)
    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/api/edge-causal/two', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'next-action': forgedActionId,
        },
        body: 'forged action',
      })
      expect(response.status).toBe(200)
    })
    const request = requests.find(
      (candidate) => candidate.url === '/api/edge-causal/two'
    )

    expect(request).toEqual(expect.objectContaining({ source: 'app-route' }))
    expect(request?.serverAction).toBeUndefined()
    expect(JSON.stringify(request)).not.toContain(forgedActionId)
  })

  it('does not classify an unknown action on an Edge App Page', async () => {
    const forgedActionId = '00'.repeat(21)
    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/edge-action', {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'next-action': forgedActionId,
        },
        body: '[]',
      })
      expect(response.ok).toBe(false)
    })
    const request = requests.find(
      (candidate) => candidate.url === '/edge-action'
    )

    expect(request).toBeDefined()
    expect(request?.serverAction).toBeUndefined()
    expect(JSON.stringify(request)).not.toContain(forgedActionId)
  })

  it('classifies Edge RSC refresh activity', async () => {
    let rscHeaders: Record<string, string> | undefined
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        page.on('request', async (request) => {
          if (request.url().includes('/edge-rsc')) {
            rscHeaders = await request.allHeaders()
          }
        })
      },
    })
    await browser.elementByCss('#edge-rsc-link').click()
    await retry(async () => {
      expect(await browser.url()).toContain('/edge-rsc')
      expect(rscHeaders).toBeDefined()
    }, 15_000)

    const requests = await captureNewRequests(async () => {
      const response = await next.fetch('/edge-rsc', {
        headers: {
          rsc: '1',
          'next-hmr-refresh': '1',
          'next-router-state-tree': rscHeaders!['next-router-state-tree'],
          'next-url': rscHeaders!['next-url'],
        },
      })
      expect(response.status).toBe(200)
    })

    expect(
      requests.find(
        (request) =>
          request.url?.startsWith('/edge-rsc') &&
          request.routerActivity === 'hmr-refresh'
      )
    ).toBeDefined()
  })
})
