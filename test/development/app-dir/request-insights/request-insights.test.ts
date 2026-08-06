import { nextTestSetup } from 'e2e-utils'
import { createServer, request as httpRequest } from 'http'
import type { AddressInfo } from 'net'
import {
  retry,
  toggleDevToolsIndicatorPopover,
  waitForNoRedbox,
} from 'next-test-utils'

type RequestInsight = {
  requestId: string
  rootRequestId?: string
  parentRootRequestId?: string
  parentFetchIndex?: number
  kind?: 'request' | 'instant-insights'
  source:
    | 'page'
    | 'app-route'
    | 'pages-api'
    | 'image'
    | 'asset'
    | 'proxy'
    | 'instant-insights'
    | 'unknown'
  proxyStatus?: 'matched' | 'bypassed'
  routerActivity?: 'prefetch' | 'segment-prefetch' | 'hmr-refresh'
  serverAction?: true
  htmlRequestId: string
  route: string
  url?: string
  startTime: number
  status: 'ok' | 'error' | 'aborted' | 'pending'
  response?: {
    trackingStartTime: number
    endTime?: number
    statusCode?: number
    outcome: 'pending' | 'finished' | 'aborted' | 'errored'
    error?: { type?: string }
  }
  spans: Array<{
    name?: string
    spanId?: string
    parentSpanId?: string
    startTime?: number
    durationMs?: number
    status?: 'ok' | 'error'
    attributes?: Record<string, string | number | boolean>
  }>
  fetches: Array<{
    index?: number
    durationMs: number
    statusCode: number
    cacheStatus: string
    method: string
    url: string
  }>
}

describe('request insights', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  function createRequest(index: number, fetchCount = 0): RequestInsight {
    return {
      requestId: `request-${index}`,
      source: 'page',
      htmlRequestId: `page-${index}`,
      route: `/route-${index}`,
      startTime: index,
      status: 'ok',
      spans: [],
      fetches: Array.from({ length: fetchCount }, (_, fetchIndex) => ({
        durationMs: fetchIndex + 1,
        statusCode: 200,
        cacheStatus: 'miss',
        method: 'GET',
        url: `https://example.com/fetch-${fetchIndex}`,
      })),
    }
  }

  async function openRequestInsightsPanel(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-request-insights]').click()
    await browser.waitForElementByCss('.request-insights-list-toolbar')
    // The panel selector menu stays mounted for its exit animation and its
    // click-outside handler would close the freshly opened panel. Wait for
    // it to fully unmount before interacting with the panel.
    await retry(async () => {
      const selectorMenuGone = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return !root?.querySelector('#nextjs-dev-tools-menu')
      })
      expect(selectorMenuGone).toBe(true)
    })
  }

  async function patchRequestInsightsConfig(patch: {
    showInternal?: boolean
    verbose?: boolean
    maxRequestGroupsPerBucket?: number
  }) {
    const response = await next.fetch('/__nextjs_devtools_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestInsights: patch }),
    })
    expect(response.status).toBe(204)
  }

  let shouldResetRequestInsightsConfig = false
  afterEach(async () => {
    if (!shouldResetRequestInsightsConfig) {
      return
    }

    await patchRequestInsightsConfig({
      showInternal: false,
      verbose: false,
      maxRequestGroupsPerBucket: 200,
    })
    shouldResetRequestInsightsConfig = false
  })

  describe('cold route resolution and compilation phases', () => {
    // These spans only appear together on the first request, so both ownership
    // assertions share one settled cold render.
    let coldRenderRequestId: Promise<string> | undefined

    function recordColdRender(): Promise<string> {
      coldRenderRequestId ??= (async () => {
        const existingRequestIds = new Set(
          (
            (await next
              .fetch('/_next/development/request-insights')
              .then((response) => response.json())) as {
              requests: RequestInsight[]
            }
          ).requests.map((request) => request.requestId)
        )

        await next.render('/route-phases-r4')

        let requestId: string
        await retry(async () => {
          const snapshot = (await next
            .fetch('/_next/development/request-insights')
            .then((response) => response.json())) as {
            requests: RequestInsight[]
          }
          const request = snapshot.requests.find(
            (candidate) =>
              candidate.route === '/route-phases-r4' &&
              !existingRequestIds.has(candidate.requestId)
          )

          expect(request).toBeDefined()
          expect(request!.status).toBe('ok')
          expect(
            request!.spans.filter((span) => span.status === 'error')
          ).toEqual([])
          requestId = request!.requestId
        })
        return requestId!
      })().catch((error) => {
        coldRenderRequestId = undefined
        throw error
      })
      return coldRenderRequestId
    }

    async function getColdRenderSpans(): Promise<RequestInsight['spans']> {
      const requestId = await recordColdRender()
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) => candidate.requestId === requestId
      )
      expect(request).toBeDefined()
      return request!.spans
    }

    it('records route matching with route preparation ownership', async () => {
      await retry(async () => {
        const spans = await getColdRenderSpans()
        const matchSpan = spans.find(
          (span) =>
            span.attributes?.['next.span_type'] === 'NextNodeServer.matchRoute'
        )
        expect(matchSpan).toBeDefined()
        expect(
          spans.some(
            (span) =>
              span.parentSpanId === matchSpan?.spanId &&
              span.attributes?.['next.span_type'] ===
                'DevRouteMatcherManager.ensureRoute'
          )
        ).toBe(true)
      })
    })

    it('records bundler phases inside the compile route span', async () => {
      await retry(async () => {
        const spans = await getColdRenderSpans()
        const compileSpan = spans.find(
          (candidate) =>
            candidate.attributes?.['next.span_type'] ===
              'DevBundlerService.ensurePage' &&
            spans.some(
              (child) =>
                child.parentSpanId === candidate.spanId &&
                child.attributes?.['next.span_type'] ===
                  'DevBundlerService.buildRoute'
            )
        )

        expect(compileSpan).toBeDefined()
        const compileChildren = spans.filter(
          (span) => span.parentSpanId === compileSpan?.spanId
        )
        const expectedCompilePhases = isTurbopack
          ? [
              'DevBundlerService.waitForEntrypoints',
              'DevBundlerService.buildRoute',
            ]
          : ['DevBundlerService.analyzeRoute', 'DevBundlerService.buildRoute']

        expect(
          compileChildren.map(
            (span) => span.attributes?.['next.span_type'] as string
          )
        ).toEqual(expect.arrayContaining(expectedCompilePhases))

        const compileStart = compileSpan!.startTime!
        const compileEnd = compileStart + compileSpan!.durationMs!
        for (const child of compileChildren) {
          expect(child.startTime).toBeGreaterThanOrEqual(compileStart - 1)
          expect(child.startTime! + child.durationMs!).toBeLessThanOrEqual(
            compileEnd + 1
          )
        }
      })
    })

    it('records definition-less resolution for a missing route', async () => {
      const missingRoute = '/route-phases-r4-missing'
      const existingRequestIds = new Set(
        (
          (await next
            .fetch('/_next/development/request-insights')
            .then((response) => response.json())) as {
            requests: RequestInsight[]
          }
        ).requests.map((request) => request.requestId)
      )

      const response = await next.fetch(missingRoute)
      expect(response.status).toBe(404)

      await retry(async () => {
        const snapshot = (await next
          .fetch('/_next/development/request-insights')
          .then((result) => result.json())) as {
          requests: RequestInsight[]
        }
        const request = snapshot.requests.find(
          (candidate) =>
            candidate.url === missingRoute &&
            !existingRequestIds.has(candidate.requestId)
        )
        expect(request).toBeDefined()
        expect(request!.status).toBe('ok')

        const compileSpan = request!.spans.find(
          (span) =>
            span.attributes?.['next.span_type'] ===
              'DevBundlerService.ensurePage' &&
            request!.spans.some(
              (child) =>
                child.parentSpanId === span.spanId &&
                child.attributes?.['next.span_type'] ===
                  'DevBundlerService.resolveRoute'
            )
        )
        const resolutionSpan = request!.spans.find(
          (span) =>
            span.parentSpanId === compileSpan?.spanId &&
            span.attributes?.['next.span_type'] ===
              'DevBundlerService.resolveRoute'
        )

        expect(compileSpan).toBeDefined()
        expect(resolutionSpan).toBeDefined()
        expect(resolutionSpan!.status).toBe('ok')
        expect(resolutionSpan!.startTime).toBeGreaterThanOrEqual(
          compileSpan!.startTime! - 1
        )
        expect(
          resolutionSpan!.startTime! + resolutionSpan!.durationMs!
        ).toBeLessThanOrEqual(
          compileSpan!.startTime! + compileSpan!.durationMs! + 1
        )
      })
    })
  })

  async function runWithResponse(body: unknown, args: string[] = []) {
    const requestedPaths: string[] = []
    const server = createServer((req, res) => {
      requestedPaths.push(req.url ?? '')
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address() as AddressInfo
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        `http://127.0.0.1:${address.port}`,
        ...args,
      ])
      return { result, requestedPaths }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }

  it('discovers the running dev server from the project lockfile', async () => {
    const result = await next.runCommand(['experimental-request-insights'])

    if (result.code !== 0) {
      throw new Error(result.cliOutput)
    }
    expect(result.cliOutput).toMatch(
      /No request insights captured yet|retained logical request groups \(newest first\)/
    )
  })

  it('keeps outer server and app render spans on the same request', async () => {
    await next.render('/')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const pageRequests = snapshot.requests.filter(
        (request) => request.route === '/'
      )
      const requestsWithRelevantSpans = pageRequests.filter((request) =>
        request.spans.some((span) => {
          const spanType = span.attributes?.['next.span_type']
          return (
            spanType === 'BaseServer.handleRequest' ||
            spanType === 'AppRender.getBodyResult'
          )
        })
      )

      expect(requestsWithRelevantSpans).toHaveLength(1)
      expect(requestsWithRelevantSpans[0].response).toEqual(
        expect.objectContaining({
          statusCode: 200,
          outcome: 'finished',
        })
      )
      expect(
        requestsWithRelevantSpans[0].spans.map(
          (span) => span.attributes?.['next.span_type']
        )
      ).toEqual(
        expect.arrayContaining([
          'BaseServer.handleRequest',
          'AppRender.getBodyResult',
        ])
      )
    })
  })

  it('links nested same-origin server fetches without merging their requests', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const response = await next.fetch('/causal?dedupe=nested-chain')
    expect(response.status).toBe(200)
    const responseBody = await response.text()
    expect(responseBody).toContain('data-request-counts="1,1"')
    expect(responseBody).toContain('data-causal-cookie-visible="false"')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const requests = snapshot.requests.filter(
        (request) =>
          !existingRequestIds.has(request.requestId) &&
          request.kind !== 'instant-insights'
      )
      const page = requests.find((request) => request.route === '/causal')
      const first = requests.find(
        (request) =>
          request.route === '/api/causal/[step]' &&
          request.url?.startsWith('/api/causal/one')
      )
      const second = requests.find(
        (request) =>
          request.route === '/api/causal/[step]' &&
          request.url?.startsWith('/api/causal/two')
      )

      expect(page).toBeDefined()
      expect(first).toEqual(
        expect.objectContaining({ parentRootRequestId: page?.rootRequestId })
      )
      expect(second).toEqual(
        expect.objectContaining({ parentRootRequestId: first?.rootRequestId })
      )
      expect(first?.requestId).not.toBe(second?.requestId)
      expect(
        page?.fetches.some(
          (fetch) =>
            fetch.url.includes('/api/causal/one') &&
            fetch.index === first?.parentFetchIndex
        )
      ).toBe(true)
      expect(
        first?.fetches.some(
          (fetch) =>
            fetch.url.includes('/api/causal/two') &&
            fetch.index === second?.parentFetchIndex
        )
      ).toBe(true)
    })
  })

  it('ignores spoofed forwarded headers when matching the router-owned origin', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const response = await next.fetch('/causal?spoof=1')
    expect(await response.text()).toContain(
      'data-causal-cookie-visible="false"'
    )

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const requests = snapshot.requests.filter(
        (request) => !existingRequestIds.has(request.requestId)
      )
      const page = requests.find((request) => request.route === '/causal')
      const child = requests.find(
        (request) =>
          request.route === '/api/causal/[step]' &&
          request.url?.startsWith('/api/causal/two')
      )

      expect(page).toBeDefined()
      expect(child).toEqual(
        expect.objectContaining({ parentRootRequestId: page?.rootRequestId })
      )
    })
  })

  it('does not propagate causality to an external fetch or redirect', async () => {
    const receivedCookies: Array<string | undefined> = []
    const server = createServer((request, response) => {
      receivedCookies.push(request.headers.cookie)
      response.statusCode = 200
      response.end('external')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const externalUrl = `http://127.0.0.1:${address.port}/external`

      expect(
        await next
          .fetch(`/causal?external=${encodeURIComponent(externalUrl)}`)
          .then((response) => response.text())
      ).toContain('external')
      expect(
        await next
          .fetch(`/causal?redirect=${encodeURIComponent(externalUrl)}`)
          .then((response) => response.text())
      ).toContain('external')

      expect(receivedCookies).toHaveLength(2)
      for (const cookie of receivedCookies) {
        expect(cookie ?? '').not.toContain('__next_request_insights_causal')
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('strips forged causal cookies without creating a relationship', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((insightsResponse) => insightsResponse.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    const forgedToken = 'A'.repeat(32)
    const response = await next.fetch('/api/causal/two?forged=1', {
      headers: {
        cookie: `user=value; __next_request_insights_causal=${forgedToken}`,
      },
    })
    expect(await response.json()).toEqual({
      causalCookieVisible: false,
      step: 'two',
    })

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const forgedRequest = snapshot.requests.find(
        (request) =>
          request.route === '/api/causal/[step]' &&
          !existingRequestIds.has(request.requestId)
      )
      expect(forgedRequest).toBeDefined()
      expect(forgedRequest?.parentRootRequestId).toBeUndefined()
      expect(forgedRequest?.parentFetchIndex).toBeUndefined()
    })
  })

  it('classifies static files as assets in the serialized snapshot', async () => {
    const response = await next.fetch('/request-insights-asset.svg')
    expect(response.status).toBe(200)
    await response.text()

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.url === '/request-insights-asset.svg' &&
          candidate.kind !== 'instant-insights'
      )

      expect(request).toEqual(expect.objectContaining({ source: 'asset' }))
    })
  })

  it('does not classify an asset URL rewritten by proxy as an asset', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((insightsResponse) => insightsResponse.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const response = await next.fetch(
      '/request-insights-asset.svg?rewrite-to-page=1'
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('behind proxy')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.route === '/behind-proxy' &&
          !existingRequestIds.has(candidate.requestId) &&
          candidate.kind !== 'instant-insights'
      )

      expect(request).toEqual(expect.objectContaining({ source: 'page' }))
    })
  })

  it('records HTML completion inside the app render span', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    await next.render('/html-completion-r5')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.route === '/html-completion-r5' &&
          !existingRequestIds.has(candidate.requestId)
      )
      expect(request).toBeDefined()

      const appRenderSpan = request!.spans.find(
        (span) =>
          span.attributes?.['next.span_type'] === 'AppRender.getBodyResult'
      )
      const completionSpan = request!.spans.find(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'AppRender.waitForHTMLCompletion'
      )
      const firstResponseChunkSpan = request!.spans.find(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'NextNodeServer.waitForFirstResponseChunk'
      )

      expect(appRenderSpan).toBeDefined()
      expect(completionSpan).toEqual(
        expect.objectContaining({
          name: 'wait for HTML completion',
          parentSpanId: appRenderSpan!.spanId,
          status: 'ok',
          startTime: expect.any(Number),
          durationMs: expect.any(Number),
        })
      )
      expect(completionSpan!.startTime).toBeGreaterThanOrEqual(
        appRenderSpan!.startTime! - 1
      )
      expect(
        completionSpan!.startTime! + completionSpan!.durationMs!
      ).toBeLessThanOrEqual(
        appRenderSpan!.startTime! + appRenderSpan!.durationMs! + 1
      )
      expect(firstResponseChunkSpan).toEqual(
        expect.objectContaining({
          name: 'wait for first response chunk',
          status: 'ok',
          startTime: expect.any(Number),
          durationMs: expect.any(Number),
        })
      )
      // Response delivery is a sibling of app rendering, not render work.
      expect(firstResponseChunkSpan!.parentSpanId).toBe(
        appRenderSpan!.parentSpanId
      )
      expect(
        completionSpan!.startTime! + completionSpan!.durationMs!
      ).toBeLessThanOrEqual(firstResponseChunkSpan!.startTime! + 1)
    })
  })

  it('does not attribute Request Insights bookkeeping to the app', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/safe-clock')

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('safe clock')
    })
    await waitForNoRedbox(browser)
    expect(next.cliOutput.slice(outputIndex)).not.toContain(
      'Route "/safe-clock": Next.js encountered the unstable value `Date.now()` while prerendering.'
    )
  })

  it('still reports genuine app wall-clock access with app source attribution', async () => {
    const outputIndex = next.cliOutput.length
    await next.browser('/app-date-now')

    await retry(() => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain(
        'Route "/app-date-now": Next.js encountered the unstable value `Date.now()` while prerendering.'
      )
      expect(output).toMatch(/at Page \(app\/app-date-now\/page\.tsx:\d+:\d+\)/)
    })
  })

  it('records Instant Insights separately from its originating request', async () => {
    await next.render('/instant-insights')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const routeInsights = snapshot.requests.filter(
        (request) => request.route === '/instant-insights'
      )
      const instantInsights = routeInsights.find(
        (request) => request.kind === 'instant-insights'
      )
      const request = routeInsights.find(
        (item) =>
          (item.kind === undefined || item.kind === 'request') &&
          item.requestId === instantInsights?.requestId
      )

      expect(instantInsights).toEqual(
        expect.objectContaining({
          kind: 'instant-insights',
          durationMs: expect.any(Number),
          status: 'ok',
        })
      )
      expect(instantInsights?.htmlRequestId).toBe(request?.htmlRequestId)
      expect(request?.fetches).toEqual([
        expect.objectContaining({
          url: 'data:redacted',
        }),
      ])
      expect(instantInsights?.fetches).toEqual([
        expect.objectContaining({
          url: 'data:redacted',
        }),
      ])
      const rootSpans = instantInsights?.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] === 'AppRender.instantInsights' &&
          span.name === 'Instant Insights'
      )
      expect(rootSpans?.length).toBeGreaterThan(0)
      for (const rootSpan of rootSpans ?? []) {
        expect(rootSpan.parentSpanId).toBeUndefined()
      }

      const pipelineSpanTypes = [
        'AppRender.instantInsights.prepareValidation',
        'AppRender.instantInsights.runValidation',
      ]
      const pipelineSpans = instantInsights?.spans.filter((span) =>
        pipelineSpanTypes.includes(
          span.attributes?.['next.span_type'] as string
        )
      )
      expect(
        pipelineSpans?.map((span) => span.attributes?.['next.span_type'])
      ).toEqual(
        expect.arrayContaining([
          'AppRender.instantInsights.prepareValidation',
          'AppRender.instantInsights.runValidation',
        ])
      )
      for (const span of pipelineSpans ?? []) {
        expect(
          rootSpans?.some((rootSpan) => rootSpan.spanId === span.parentSpanId)
        ).toBe(true)
      }
      expect(
        request?.spans.some(
          (span) =>
            span.attributes?.['next.span_type'] ===
              'AppRender.instantInsights' ||
            pipelineSpanTypes.includes(
              span.attributes?.['next.span_type'] as string
            )
        )
      ).toBe(false)
    })
  })

  it('persists verbose trace settings', async () => {
    const browser = await next.browser('/instant-insights')
    shouldResetRequestInsightsConfig = true

    function getSettingsMenuState(): Promise<{
      open: boolean
      checked: string | null
    }> {
      return browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const item = Array.from(
          root?.querySelectorAll('.request-insights-settings-item') ?? []
        ).find((candidate) => candidate.textContent?.includes('Verbose traces'))
        return {
          open: !!root?.querySelector('.request-insights-settings-menu'),
          checked:
            item
              ?.querySelector('.request-insights-settings-checkbox')
              ?.getAttribute('data-checked') ?? null,
        }
      })
    }

    function getSpanRowCount(): Promise<number> {
      return browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return root?.querySelectorAll('.request-insights-span-row').length ?? 0
      })
    }

    await openRequestInsightsPanel(browser)
    await retry(async () => {
      const selectedRegularRequest = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const row = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).find(
          (candidate) => !candidate.textContent?.includes('Instant Insights')
        )
        row?.click()
        return row !== undefined
      })
      expect(selectedRegularRequest).toBe(true)
    })
    await browser.elementByCss('.request-insights-settings-trigger').click()

    await retry(async () => {
      expect(await getSettingsMenuState()).toEqual({
        open: true,
        checked: null,
      })
    })

    let defaultSpanRowCount = 0
    await retry(async () => {
      defaultSpanRowCount = await getSpanRowCount()
      expect(defaultSpanRowCount).toBeGreaterThan(0)
    })

    await browser
      .elementByCss(
        '.request-insights-settings-item:has-text("Verbose traces")'
      )
      .click()

    await retry(async () => {
      expect(await getSettingsMenuState()).toEqual({
        open: true,
        checked: 'true',
      })
      expect(await getSpanRowCount()).toBeGreaterThan(defaultSpanRowCount)
    })

    await retry(async () => {
      const config = JSON.parse(
        await next.readFile('build/dev/cache/next-devtools-config.json')
      )
      expect(config.requestInsights?.verbose).toBe(true)
    })

    await browser.elementByCss('.request-insights-details').click()
    await retry(async () => {
      expect((await getSettingsMenuState()).open).toBe(false)
    })

    await browser.refresh()
    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-settings-trigger').click()

    await retry(async () => {
      expect(await getSettingsMenuState()).toEqual({
        open: true,
        checked: 'true',
      })
    })
  })

  it('restores Internal activity across an overlay reload', async () => {
    const browser = await next.browser('/instant-insights')
    shouldResetRequestInsightsConfig = true

    await patchRequestInsightsConfig({ showInternal: true })
    await retry(async () => {
      const config = JSON.parse(
        await next.readFile('build/dev/cache/next-devtools-config.json')
      )
      expect(config.requestInsights?.showInternal).toBe(true)
    })

    await browser.refresh()
    await browser.elementById('emit-request-insights-snapshot').click()
    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-settings-trigger').click()

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const item = Array.from(
          root?.querySelectorAll('.request-insights-settings-item') ?? []
        ).find((candidate) =>
          candidate.textContent?.includes('Internal activity')
        )
        return {
          checked:
            item
              ?.querySelector('.request-insights-settings-checkbox')
              ?.getAttribute('data-checked') ?? null,
          syntheticInternalVisible: Array.from(
            root?.querySelectorAll(
              '.request-insights-row[data-internal="true"]'
            ) ?? []
          ).some((row) =>
            row.getAttribute('aria-label')?.includes('/synthetic-internal')
          ),
        }
      })

      expect(state).toEqual({
        checked: 'true',
        syntheticInternalVisible: true,
      })
    })
  })

  it('contains Request Insights scrolling inside the overlay panes', async () => {
    const browser = await next.browser('/instant-insights')

    await browser.elementById('emit-request-insights-snapshot').click()
    await openRequestInsightsPanel(browser)

    await retry(async () => {
      const state = await browser.eval(() => {
        document.body.style.minHeight = '300vh'
        window.scrollTo(0, 200)

        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const list = root?.querySelector<HTMLElement>('.request-insights-list')
        const details = root?.querySelector<HTMLElement>(
          '.request-insights-details'
        )
        const pageScrollBefore = window.scrollY

        if (list) {
          list.scrollTop = list.scrollHeight
          list.scrollBy({ top: 100 })
        }

        return {
          detailsOverscroll: details
            ? getComputedStyle(details).overscrollBehaviorY
            : null,
          listOverflow: list ? getComputedStyle(list).overflowY : null,
          listOverscroll: list
            ? getComputedStyle(list).overscrollBehaviorY
            : null,
          listScrollable: list
            ? list.scrollHeight > list.clientHeight && list.scrollTop > 0
            : false,
          pageScrollBefore,
          pageScrollAfter: window.scrollY,
        }
      })

      expect(state).toEqual({
        detailsOverscroll: 'contain',
        listOverflow: 'auto',
        listOverscroll: 'contain',
        listScrollable: true,
        pageScrollBefore: 200,
        pageScrollAfter: 200,
      })
    })
  })

  it('persists capture limits and clears captured data from the panel', async () => {
    const browser = await next.browser('/')
    shouldResetRequestInsightsConfig = true
    await next.render('/safe-clock')
    await next.render('/instant-insights')

    await openRequestInsightsPanel(browser)
    await retry(async () => {
      expect(
        await browser.eval(() => {
          const root = document.querySelector('nextjs-portal')?.shadowRoot
          return root?.querySelectorAll(
            '.request-insights-request-type[data-type="page"]'
          ).length
        })
      ).toBeGreaterThan(2)
    })
    await browser.elementByCss('.request-insights-settings-trigger').click()
    expect(
      await browser
        .elementByCss('.request-insights-settings-menu')
        .getAttribute('role')
    ).toBe('dialog')
    let focusedControlLabel: string | null = null
    for (let index = 0; index < 5; index++) {
      focusedControlLabel = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return root?.activeElement?.getAttribute('aria-label') ?? null
      })
      if (focusedControlLabel === 'Requests retained per type') break
      await browser.keydown('Tab')
      await browser.keyup('Tab')
    }
    expect(focusedControlLabel).toBe('Requests retained per type')
    await browser.keydown('Tab')
    await browser.keyup('Tab')
    expect(
      await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return root?.activeElement?.textContent?.trim()
      })
    ).toBe('Clear captured data')
    const captureLimit = await browser.elementByCss(
      '.request-insights-capture-limit input'
    )
    await captureLimit.fill('2')
    await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      root
        ?.querySelector<HTMLInputElement>(
          '.request-insights-capture-limit input'
        )
        ?.blur()
    })

    await retry(async () => {
      const config = JSON.parse(
        await next.readFile('build/dev/cache/next-devtools-config.json')
      )
      expect(config.requestInsights?.maxRequestGroupsPerBucket).toBe(2)
    })
    await retry(async () => {
      expect(
        await browser.eval(() => {
          const root = document.querySelector('nextjs-portal')?.shadowRoot
          return root?.querySelectorAll(
            '.request-insights-request-type[data-type="page"]'
          ).length
        })
      ).toBeLessThanOrEqual(2)
    })

    await browser.refresh()
    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-settings-trigger').click()
    await retry(async () => {
      expect(
        await browser
          .elementByCss('.request-insights-capture-limit input')
          .getAttribute('value')
      ).toBe('2')
      expect(
        await browser.hasElementByCss('.request-insights-capture-meter')
      ).toBe(true)
    })

    await browser.eval(() => {
      const originalFetch = window.fetch.bind(window)
      let releaseClearResponse: (() => void) | undefined
      const clearResponseGate = new Promise<void>((resolve) => {
        releaseClearResponse = resolve
      })
      ;(
        window as typeof window & {
          __releaseRequestInsightsClearResponse?: () => void
        }
      ).__releaseRequestInsightsClearResponse = releaseClearResponse
      window.fetch = async (...args) => {
        const response = await originalFetch(...args)
        if (
          String(args[0]).includes('/_next/development/request-insights/clear')
        ) {
          await clearResponseGate
        }
        return response
      }
    })
    await browser.elementByCss('.request-insights-capture-clear').click()
    await retry(async () => {
      const snapshot = await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())
      expect(snapshot.requests).toEqual([])
      expect(snapshot.capture.limits.maxRequestGroupsPerBucket).toBe(2)
      expect(snapshot.capture.usage.retainedRequestCount).toBe(0)
    })

    await next.render('/safe-clock?after=clear')
    await retry(async () => {
      const snapshot = await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())
      expect(
        snapshot.requests.some((request: { url?: string }) =>
          request.url?.startsWith('/safe-clock?')
        )
      ).toBe(true)
    })
    await browser.eval(() => {
      ;(
        window as typeof window & {
          __releaseRequestInsightsClearResponse?: () => void
        }
      ).__releaseRequestInsightsClearResponse?.()
    })
    await retry(async () => {
      const routes = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return Array.from(
          root?.querySelectorAll('.request-insights-route-label') ?? []
        ).map((route) => route.textContent)
      })
      expect(routes).toContain('/safe-clock?query=redacted')
    })
  })

  it('relates owned Instant Insights to the foreground request', async () => {
    const browser = await next.browser('/instant-insights')
    shouldResetRequestInsightsConfig = true
    await next.fetch('/api/source?scope=all')

    await openRequestInsightsPanel(browser)

    let allRequestCount = 0
    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const rows = Array.from(
          root?.querySelectorAll('.request-insights-row') ?? []
        )
        const owner = rows.find(
          (row) =>
            row.querySelector('.request-insights-route-label')?.textContent ===
            '/instant-insights'
        )
        return {
          rowCount: rows.length,
          internalRowCount: rows.filter(
            (row) => row.getAttribute('data-internal') === 'true'
          ).length,
          ownerInstantLabel: owner
            ?.querySelector('[data-activity="instant-insights"]')
            ?.textContent?.trim(),
        }
      })

      allRequestCount = state.rowCount
      expect(state.rowCount).toBeGreaterThan(0)
      expect(state.internalRowCount).toBe(0)
      expect(state.ownerInstantLabel).toBe('Instant')
    })

    await retry(async () => {
      const selected = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const owner = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).find(
          (row) =>
            row.querySelector('.request-insights-route-label')?.textContent ===
            '/instant-insights'
        )
        owner?.click()
        return owner !== undefined
      })
      expect(selected).toBe(true)
    })

    await retry(async () => {
      const instantSection = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const section = root?.querySelector<HTMLDetailsElement>(
          '.request-insights-instant-section'
        )
        return {
          exists: section !== null,
          open: section?.open ?? null,
          title: section
            ?.querySelector('summary > span:first-child')
            ?.textContent?.trim(),
        }
      })
      expect(instantSection.exists).toBe(true)
      expect(instantSection.open).toBe(false)
      expect(instantSection.title).toBe('Instant Insights')
    })

    await browser
      .elementByCss('.request-insights-instant-section > summary')
      .click()
    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const section = root?.querySelector<HTMLDetailsElement>(
          '.request-insights-instant-section'
        )
        return {
          open: section?.open ?? false,
          traceRows:
            section?.querySelectorAll('.request-insights-span-row').length ?? 0,
        }
      })
      expect(state.open).toBe(true)
      expect(state.traceRows).toBeGreaterThan(0)
    })

    await browser
      .elementByCss(
        '.request-insights-scope-switcher button:has-text("This page")'
      )
      .click()
    await retry(async () => {
      const pageScope = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const button = Array.from(
          root?.querySelectorAll<HTMLButtonElement>(
            '.request-insights-scope-switcher button'
          ) ?? []
        ).find((item) => item.textContent?.trim() === 'This page')
        return {
          pressed: button?.getAttribute('aria-pressed'),
          requestCount:
            root?.querySelectorAll('.request-insights-row').length ?? 0,
        }
      })
      expect(pageScope.pressed).toBe('true')
      expect(pageScope.requestCount).toBeGreaterThan(0)
      expect(pageScope.requestCount).toBeLessThan(allRequestCount)
    })
  })

  it('filters typed request rows and pauses live updates', async () => {
    const browser = await next.browser('/instant-insights')
    expect((await next.fetch('/api/source?before=pause')).status).toBe(200)

    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-filter-trigger').click()
    await browser
      .elementByCss(
        '.request-insights-filter-item[data-filter-value="source:api"]'
      )
      .click()

    await retry(async () => {
      const rowTypes = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return Array.from(
          root?.querySelectorAll('.request-insights-request-type') ?? []
        ).map((type) => type.textContent?.trim())
      })
      expect(rowTypes.length).toBeGreaterThan(0)
      expect(new Set(rowTypes)).toEqual(new Set(['API']))
    })

    await browser.elementByCss('.request-insights-details').click()
    await browser.elementByCss('.request-insights-settings-trigger').click()
    await browser
      .elementByCss('.request-insights-settings-item:has-text("Pause updates")')
      .click()

    const pausedRowCount = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      return root?.querySelectorAll('.request-insights-row').length ?? 0
    })
    expect((await next.fetch('/api/source?while=paused')).status).toBe(200)

    await retry(async () => {
      const pausedState = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return {
          paused: root?.querySelector('.request-insights-paused-state')
            ?.textContent,
          rowCount: root?.querySelectorAll('.request-insights-row').length ?? 0,
        }
      })
      expect(pausedState).toEqual({
        paused: 'Paused',
        rowCount: pausedRowCount,
      })
    })

    await browser
      .elementByCss('.request-insights-settings-item:has-text("Pause updates")')
      .click()
    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return {
          paused: root?.querySelector('.request-insights-paused-state'),
          rowCount: root?.querySelectorAll('.request-insights-row').length ?? 0,
        }
      })
      expect(state.paused).toBeNull()
      expect(state.rowCount).toBeGreaterThan(pausedRowCount)
    })
  })

  it('shows concrete request URLs, route params, and fetch origins', async () => {
    const browser = await next.browser('/products/blue?tab=details')

    await retry(async () => {
      expect(await browser.elementById('product-id').text()).toBe('blue')
    })
    await openRequestInsightsPanel(browser)

    await retry(async () => {
      const selected = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const row = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).find((candidate) =>
          candidate.textContent?.includes('/products/blue?query=redacted')
        )
        row?.click()
        return row !== undefined
      })
      expect(selected).toBe(true)
    })

    await retry(async () => {
      const details = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const panel = root?.querySelector('.request-insights-details')
        return {
          text: panel?.textContent ?? '',
          paramsLabel:
            panel?.querySelector('.request-insights-params-trigger')
              ?.textContent ?? '',
          fetchOrigins: Array.from(
            panel?.querySelectorAll('.request-insights-fetch-origin') ?? []
          ).map((element) => element.textContent ?? ''),
          fetchTraceLabels: Array.from(
            panel?.querySelectorAll(
              '.request-insights-span-row[data-kind="fetch"] .request-insights-span-label'
            ) ?? []
          ).map((element) => element.textContent ?? ''),
        }
      })

      expect(details.text).toContain('/products/blue?query=redacted')
      expect(details.text).toContain('Route /products/[id]')
      expect(details.paramsLabel).toBe('Params id')
      expect(details.fetchOrigins).toContain('Same origin')
      expect(
        details.fetchTraceLabels.some((label) => label.includes('Same origin'))
      ).toBe(true)
      expect(details.text).not.toContain('Q2_SECRET_SENTINEL')
    })
  })

  it('keeps trace inspection anchored while the panel is resized', async () => {
    const browser = await next.browser('/products/blue?tab=details')
    await openRequestInsightsPanel(browser)

    const foregroundTraceSelector =
      '.request-insights-details > .request-insights-section .request-insights-trace-rows'

    await retry(async () => {
      const selected = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const row = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).find((candidate) =>
          candidate.textContent?.includes('/products/blue?query=redacted')
        )
        row?.click()
        return row?.dataset.selected === 'true'
      })
      expect(selected).toBe(true)
    })

    await browser
      .locator(
        `nextjs-portal ${foregroundTraceSelector} .request-insights-span-row[data-active="true"]`
      )
      .hover()
    await browser.locator(`nextjs-portal ${foregroundTraceSelector}`).focus()

    const readTraceState = () =>
      browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const panel = root?.querySelector<HTMLElement>(
          '.request-insights-panel-container'
        )
        const listbox = root?.querySelector<HTMLElement>(
          '.request-insights-details > .request-insights-section .request-insights-trace-rows'
        )
        const activeDescendant = listbox?.getAttribute('aria-activedescendant')
        const activeRow = listbox?.querySelector<HTMLElement>(
          '.request-insights-span-row[data-active="true"]'
        )
        const firstRow = listbox?.querySelector<HTMLElement>(
          '.request-insights-span-row'
        )
        const tooltip = root?.querySelector<HTMLElement>(
          '.request-insights-trace-tooltip'
        )
        const panelRect = panel?.getBoundingClientRect()
        const rowRect = activeRow?.getBoundingClientRect()
        const tooltipRect = tooltip?.getBoundingClientRect()

        return {
          activeRowCount:
            listbox?.querySelectorAll(
              '.request-insights-span-row[data-active="true"]'
            ).length ?? 0,
          activeDescendant,
          activeRowId: activeRow?.id ?? null,
          activeTraceItemId: activeRow?.dataset.traceItemId ?? null,
          firstRowId: firstRow?.id ?? null,
          activeLabel: activeRow?.getAttribute('aria-label') ?? null,
          requestTitle:
            root
              ?.querySelector('.request-insights-title')
              ?.textContent?.trim() ?? null,
          focused: root?.activeElement === listbox,
          horizontalOverlap:
            !!rowRect &&
            !!tooltipRect &&
            tooltipRect.right >= rowRect.left &&
            tooltipRect.left <= rowRect.right,
          tooltipLabel: tooltip?.textContent?.trim() ?? null,
          tooltipNearPanel:
            !!panelRect &&
            !!tooltipRect &&
            tooltipRect.right >= panelRect.left - 100 &&
            tooltipRect.left <= panelRect.right + 100 &&
            tooltipRect.bottom >= panelRect.top - 100 &&
            tooltipRect.top <= panelRect.bottom + 100,
          verticalGap:
            rowRect && tooltipRect
              ? Math.min(
                  Math.abs(tooltipRect.bottom - rowRect.top),
                  Math.abs(tooltipRect.top - rowRect.bottom)
                )
              : Number.POSITIVE_INFINITY,
        }
      })

    const expectAnchoredTrace = async (expectedTraceItemId?: string | null) =>
      retry(async () => {
        const state = await readTraceState()
        expect(state.activeRowCount).toBe(1)
        expect(state.activeDescendant).toEqual(expect.any(String))
        if (expectedTraceItemId !== undefined) {
          expect(state.activeTraceItemId).toBe(expectedTraceItemId)
        }
        expect(state.activeRowId).toBe(state.activeDescendant)
        expect(state.activeLabel).toBe(state.tooltipLabel)
        expect(state.focused).toBe(true)
        expect(state.horizontalOverlap).toBe(true)
        expect(state.tooltipNearPanel).toBe(true)
        expect(state.verticalGap).toBeLessThan(160)
        return state
      })

    const initialState = await expectAnchoredTrace()

    await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      root
        ?.querySelector<HTMLElement>(
          '.request-insights-details > .request-insights-section .request-insights-trace-rows'
        )
        ?.dispatchEvent(
          new KeyboardEvent('keydown', {
            altKey: true,
            bubbles: true,
            key: 'ArrowDown',
          })
        )
    })
    expect((await readTraceState()).activeTraceItemId).toBe(
      initialState.activeTraceItemId
    )

    await browser.keydown('ArrowDown')
    await browser.keyup('ArrowDown')

    const nextState = await retry(async () => {
      const state = await readTraceState()
      expect(state.activeTraceItemId).not.toBe(initialState.activeTraceItemId)
      return state
    })
    await expectAnchoredTrace(nextState.activeTraceItemId)

    const columnCountAtPanelWidth = async (width: number): Promise<number> => {
      return await browser.eval(`(() => {
        const root = document.querySelector('nextjs-portal').shadowRoot
        const panelContainer = root.querySelector('.dynamic-panel-container')
        panelContainer.style.width = '${width}px'
        const panel = root.querySelector('.request-insights-panel')
        return getComputedStyle(panel).gridTemplateColumns.split(' ').length
      })()`)
    }

    await retry(async () => {
      expect(await columnCountAtPanelWidth(760)).toBe(2)
    })
    await expectAnchoredTrace()
    await retry(async () => {
      expect(await columnCountAtPanelWidth(560)).toBe(1)
    })
    await expectAnchoredTrace()
    await retry(async () => {
      expect(await columnCountAtPanelWidth(760)).toBe(2)
    })
    await expectAnchoredTrace()

    await browser
      .locator('nextjs-portal .request-insights-row[aria-label^="/api/source"]')
      .first()
      .click()

    await retry(async () => {
      const selection = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const row = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).find((candidate) => candidate.textContent?.includes('/api/source'))
        return {
          found: row !== undefined,
          selected: row?.dataset.selected,
          title: root
            ?.querySelector<HTMLElement>('.request-insights-title')
            ?.textContent?.trim(),
          activeRowId: root?.querySelector<HTMLElement>(
            '.request-insights-span-row[data-active="true"]'
          )?.id,
          firstRowId: root?.querySelector<HTMLElement>(
            '.request-insights-span-row'
          )?.id,
        }
      })
      expect(selection.found).toBe(true)
      expect(selection.selected).toBe('true')
      expect(selection.title).toBe('/api/source?query=redacted')
      expect(selection.firstRowId).toEqual(expect.any(String))
      expect(selection.activeRowId).toBe(selection.firstRowId)
    })

    await retry(async () => {
      const state = await readTraceState()
      expect(state.activeRowCount).toBe(1)
      expect(state.requestTitle).toBe('/api/source?query=redacted')
      expect(state.activeTraceItemId).not.toBe(nextState.activeTraceItemId)
    })

    await browser
      .locator(
        `nextjs-portal ${foregroundTraceSelector} .request-insights-span-row:first-child`
      )
      .hover()
    await browser.locator(`nextjs-portal ${foregroundTraceSelector}`).focus()

    const switchedState = await expectAnchoredTrace()
    expect(switchedState.activeDescendant).toBe(switchedState.firstRowId)
  })

  it('classifies framework-owned request activity without retaining action IDs', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const routeResponse = await next.fetch('/api/source')
    expect(routeResponse.status).toBe(200)
    const prefetchResponse = await next.fetch('/?activity=prefetch', {
      headers: {
        rsc: '1',
        'next-router-prefetch': '2',
      },
    })
    expect(prefetchResponse.status).toBe(200)
    const actionIds: string[] = []
    const browser = await next.browser('/actions', {
      beforePageLoad(page) {
        page.route('**/actions**', async (route) => {
          const actionId = (await route.request().allHeaders())['next-action']
          if (actionId) {
            actionIds.push(actionId)
          }
          await route.continue()
        })
      },
    })
    await browser.eval(() => {
      document.querySelector<HTMLButtonElement>('#run-server-action')?.click()
    })

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const requests = snapshot.requests.filter(
        (request) => !existingRequestIds.has(request.requestId)
      )

      expect(requests.find((request) => request.url === '/api/source')).toEqual(
        expect.objectContaining({
          source: 'app-route',
          proxyStatus: 'matched',
        })
      )
      expect(
        requests.find((request) => request.routerActivity === 'prefetch')
      ).toEqual(
        expect.objectContaining({
          source: 'page',
          proxyStatus: 'bypassed',
          routerActivity: 'prefetch',
        })
      )
      expect(
        requests.find(
          (request) =>
            request.route === '/actions' && request.serverAction === true
        )
      ).toEqual(
        expect.objectContaining({
          source: 'page',
          serverAction: true,
        })
      )

      const serialized = JSON.stringify(requests)
      expect(actionIds).toHaveLength(1)
      expect(actionIds[0]).toMatch(/^[0-9a-f]{42}$/)
      for (const actionId of actionIds) {
        expect(serialized).not.toContain(actionId)
      }
      expect(serialized).not.toContain('next-action')
    })

    const requestIdsAfterAction = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    await browser.elementById('run-cached-function').click()
    await retry(async () => {
      expect(await browser.elementById('cached-function-result').text()).toBe(
        'cached-function-complete'
      )
    })
    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const cacheRequests = snapshot.requests.filter(
        (request) =>
          !requestIdsAfterAction.has(request.requestId) &&
          request.route === '/actions' &&
          request.kind !== 'instant-insights' &&
          request.spans.some(
            (span) => span.attributes?.['http.method'] === 'POST'
          )
      )

      expect(cacheRequests).toHaveLength(1)
      expect(cacheRequests[0].serverAction).toBeUndefined()
      expect(actionIds).toHaveLength(2)
      expect(JSON.stringify(cacheRequests[0])).not.toContain(actionIds[1])
    })
  })

  it('classifies an App Route before its handler completes', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    const waitKey = `active-${Date.now()}`
    const requestPath = `/api/app-stream-lifecycle?wait=${waitKey}`
    const recordedRequestPath = '/api/app-stream-lifecycle?query=redacted'
    const responsePromise = next.fetch(requestPath)

    try {
      await retry(async () => {
        const snapshot = (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
        const matchingRequests = snapshot.requests.filter(
          (request) =>
            !existingRequestIds.has(request.requestId) &&
            request.url === recordedRequestPath &&
            request.kind !== 'instant-insights'
        )

        expect(matchingRequests).toHaveLength(1)
        expect(matchingRequests[0]).toEqual(
          expect.objectContaining({
            source: 'app-route',
            proxyStatus: 'matched',
            status: 'pending',
            response: expect.objectContaining({
              outcome: 'pending',
            }),
          })
        )
      })
    } finally {
      const release = await next.fetch(
        `/api/app-stream-lifecycle?release=${waitKey}`,
        { method: 'POST' }
      )
      expect(release.status).toBe(204)
    }

    const response = await responsePromise
    expect(response.status).toBe(202)
    expect(await response.text()).toContain('finished')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const matchingRequests = snapshot.requests.filter(
        (request) =>
          !existingRequestIds.has(request.requestId) &&
          request.url === recordedRequestPath &&
          request.kind !== 'instant-insights' &&
          request.spans.some(
            (span) => span.attributes?.['http.method'] === 'GET'
          )
      )

      expect(matchingRequests).toHaveLength(1)
      expect(matchingRequests[0]).toEqual(
        expect.objectContaining({
          status: 'ok',
          response: expect.objectContaining({
            statusCode: 202,
            outcome: 'finished',
          }),
        })
      )
      expect(
        matchingRequests[0].spans.map(
          (span) => span.attributes?.['next.span_type']
        )
      ).toEqual(
        expect.arrayContaining([
          'Middleware.execute',
          'BaseServer.handleRequest',
          'AppRouteRouteHandlers.runHandler',
        ])
      )
    })
  })

  it('tracks a streamed Pages API response through delivery completion', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const response = await next.fetch('/api/response-lifecycle')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('data: finished')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.url === '/api/response-lifecycle' &&
          !existingRequestIds.has(candidate.requestId)
      )

      expect(request).toEqual(
        expect.objectContaining({
          source: 'pages-api',
          status: 'ok',
          response: expect.objectContaining({
            statusCode: 200,
            outcome: 'finished',
          }),
        })
      )
      expect(request?.response?.endTime).toEqual(expect.any(Number))
      expect(request?.response?.endTime).toBeGreaterThanOrEqual(
        request?.response?.trackingStartTime ?? Infinity
      )
    })
  })

  it('distinguishes a client disconnect from a late stream error', async () => {
    const requestIdsBeforeAbort = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    await new Promise<void>((resolve, reject) => {
      const clientRequest = httpRequest(
        new URL('/api/response-lifecycle?outcome=abort', next.url),
        (response) => {
          response.once('data', () => {
            response.destroy()
            resolve()
          })
        }
      )
      clientRequest.once('error', reject)
      clientRequest.end()
    })

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.url === '/api/response-lifecycle?query=redacted' &&
          !requestIdsBeforeAbort.has(candidate.requestId)
      )

      expect(request).toEqual(
        expect.objectContaining({
          status: 'aborted',
          response: expect.objectContaining({
            statusCode: 200,
            outcome: 'aborted',
            error: { type: 'ResponseAborted' },
          }),
        })
      )
    })

    const requestIdsBeforeError = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    await new Promise<void>((resolve, reject) => {
      let responseStarted = false
      const clientRequest = httpRequest(
        new URL('/api/response-lifecycle?outcome=error', next.url),
        (response) => {
          responseStarted = true
          response.once('aborted', resolve)
          response.once('close', resolve)
          response.once('error', resolve)
          response.resume()
        }
      )
      clientRequest.once('error', (error) => {
        if (responseStarted) {
          resolve()
        } else {
          reject(error)
        }
      })
      clientRequest.end()
    })

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const request = snapshot.requests.find(
        (candidate) =>
          candidate.url === '/api/response-lifecycle?query=redacted' &&
          !requestIdsBeforeError.has(candidate.requestId)
      )

      expect(request).toEqual(
        expect.objectContaining({
          status: 'error',
          response: expect.objectContaining({
            statusCode: 200,
            outcome: 'errored',
            error: { type: 'Error' },
          }),
        })
      )
    })
  })

  it('classifies a Page after proxy completes', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    const requestPath = `/api/proxied-page?run=${Date.now()}`
    const recordedRequestPath = '/api/proxied-page?query=redacted'
    const response = await next.fetch(requestPath)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('proxied page')

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const matchingRequests = snapshot.requests.filter(
        (request) =>
          !existingRequestIds.has(request.requestId) &&
          request.url === recordedRequestPath &&
          request.kind !== 'instant-insights'
      )

      expect(matchingRequests).toHaveLength(1)
      expect(matchingRequests[0]).toEqual(
        expect.objectContaining({
          source: 'page',
          proxyStatus: 'matched',
        })
      )
      expect(
        matchingRequests[0].spans.map(
          (span) => span.attributes?.['next.span_type']
        )
      ).toEqual(
        expect.arrayContaining([
          'Middleware.execute',
          'BaseServer.handleRequest',
          'AppRender.getBodyResult',
        ])
      )
    })
  })

  it('does not trust an unrecognized Server Action header', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )
    const forgedActionId = '00'.repeat(21)

    const response = await next.fetch('/actions', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'next-action': forgedActionId,
      },
      body: '[]',
    })
    expect(response.ok).toBe(false)

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const forgedRequest = snapshot.requests.find(
        (request) =>
          !existingRequestIds.has(request.requestId) &&
          request.kind !== 'instant-insights' &&
          request.spans.some(
            (span) => span.attributes?.['http.method'] === 'POST'
          )
      )

      expect(forgedRequest).toBeDefined()
      expect(forgedRequest?.serverAction).toBeUndefined()
      expect(JSON.stringify(forgedRequest)).not.toContain(forgedActionId)
    })
  })

  it('does not reserve the causal cookie when Request Insights is disabled', async () => {
    await next.patchFile(
      'next.config.js',
      (content) =>
        content.replace('requestInsights: true', 'requestInsights: false'),
      async () => {
        await retry(async () => {
          expect(
            (await next.fetch('/_next/development/request-insights')).status
          ).toBe(404)
        })

        const response = await next.fetch('/api/causal/two', {
          headers: {
            cookie: '__next_request_insights_causal=user-value; user=value',
          },
        })
        expect(await response.json()).toEqual({
          causalCookieVisible: true,
          step: 'two',
        })
      }
    )
  })

  it('queries complete logical request groups from the CLI in human and JSON output', async () => {
    const oldestRoot = createRequest(1)
    const oldestChild = {
      ...createRequest(2),
      rootRequestId: oldestRoot.requestId,
      htmlRequestId: oldestRoot.htmlRequestId,
    }
    const newestRoot = createRequest(3)
    const newestChild = {
      ...createRequest(4, 7),
      rootRequestId: newestRoot.requestId,
      htmlRequestId: newestRoot.htmlRequestId,
      kind: 'instant-insights' as const,
    }
    const { result, requestedPaths } = await runWithResponse(
      {
        requests: [oldestRoot, oldestChild, newestRoot, newestChild],
      },
      [
        '--limit',
        '1',
        '--request-id',
        newestChild.requestId,
        '--html-request-id',
        newestRoot.htmlRequestId,
      ]
    )

    expect(result.code).toBe(0)
    expect(requestedPaths).toEqual([
      `/_next/development/request-insights?limit=1&requestId=${newestChild.requestId}&htmlRequestId=${newestRoot.htmlRequestId}`,
    ])
    expect(result.stdout).toContain(
      'Showing 1 of 2 retained logical request groups (newest first).'
    )
    expect(result.stdout).toContain('/route-3')
    expect(result.stdout).toContain('/route-4')
    expect(result.stdout).toContain('Instant Insights · /route-4')
    expect(result.stdout).toContain('kind instant-insights')
    expect(result.stdout).not.toContain('/route-2')
    expect(result.stdout).toContain('showing first 5 of 7 fetches')
    expect(result.stdout).toContain('https://example.com/fetch-4')
    expect(result.stdout).not.toContain('https://example.com/fetch-5')

    const json = await runWithResponse(
      {
        requests: [oldestRoot, oldestChild, newestRoot, newestChild],
      },
      ['--json', '--limit', '1']
    )
    expect(json.result.code).toBe(0)
    expect(json.requestedPaths).toEqual([
      '/_next/development/request-insights?limit=1',
    ])
    expect(
      (JSON.parse(json.result.stdout) as { requests: RequestInsight[] })
        .requests
    ).toEqual([newestRoot, newestChild])
  })

  it('validates bounded CLI snapshot query options before making a request', async () => {
    for (const args of [
      ['--limit', '201'],
      ['--request-id', 'x'.repeat(129)],
      ['--html-request-id', 'invalid id'],
    ]) {
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        'http://127.0.0.1:1',
        ...args,
      ])
      expect(result.code).toBe(1)
      expect(result.stderr).toMatch(
        /Invalid (request limit|request ID|HTML request ID)/
      )
      expect(result.stderr).not.toContain('Failed to reach')
    }
  })

  it('parses bounded snapshot queries at the development endpoint', async () => {
    await next.fetch('/api/source?query=endpoint')

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as { requests: RequestInsight[] }
    const request = snapshot.requests.find(
      (candidate) => candidate.url === '/api/source?query=redacted'
    )
    expect(request).toBeDefined()

    const query = new URLSearchParams({
      limit: '1',
      requestId: request!.requestId,
      htmlRequestId: request!.htmlRequestId,
    })
    const filteredResponse = await next.fetch(
      `/_next/development/request-insights?${query}`
    )
    expect(filteredResponse.status).toBe(200)
    const filtered = (await filteredResponse.json()) as {
      requests: RequestInsight[]
    }
    expect(filtered.requests.length).toBeGreaterThan(0)
    expect(
      new Set(
        filtered.requests.map(
          (candidate) => candidate.rootRequestId ?? candidate.requestId
        )
      )
    ).toEqual(new Set([request!.rootRequestId ?? request!.requestId]))

    for (const invalidQuery of [
      'limit=201',
      `requestId=${'x'.repeat(129)}`,
      'htmlRequestId=invalid%20id',
    ]) {
      const response = await next.fetch(
        `/_next/development/request-insights?${invalidQuery}`
      )
      expect(response.status).toBe(400)
    }

    const clearResponse = await next.fetch(
      '/_next/development/request-insights/clear?limit=invalid',
      { method: 'POST' }
    )
    expect(clearResponse.status).toBe(200)
    await expect(clearResponse.json()).resolves.toMatchObject({ requests: [] })
  })

  it('updates the bounded capture limit through the CLI and can clear data', async () => {
    shouldResetRequestInsightsConfig = true
    const browser = await next.browser('/')

    const update = await next.runCommand([
      'experimental-request-insights',
      '--capture-groups-per-type',
      '1',
    ])
    expect(update.code).toBe(0)
    expect(update.stdout).toContain(
      'Request Insights retains up to 1 logical request group per type.'
    )

    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-settings-trigger').click()
    await browser
      .elementByCss('.request-insights-settings-item:has-text("Pause updates")')
      .click()
    const clear = await next.runCommand([
      'experimental-request-insights',
      '--clear',
    ])
    expect(clear.code).toBe(0)
    expect(clear.stdout).toContain('Cleared captured Request Insights data.')
    await retry(async () => {
      expect(
        await browser.elementByCss('.request-insights-list-empty').text()
      ).toContain('Request insights will appear after the next server request.')
    })
    await expect(
      next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())
        .then((snapshot) => snapshot.requests)
    ).resolves.toEqual([])
  })

  it('bounds CLI responses and escapes terminal control characters', async () => {
    const oversized = await runWithResponse({
      requests: [],
      padding: 'x'.repeat(4 * 1024 * 1024),
    })
    expect(oversized.result.code).toBe(1)
    expect(oversized.result.stderr).toContain('exceeds the 4194304 byte limit')

    const escaped = await runWithResponse({
      requests: [
        {
          ...createRequest(1, 1),
          requestId: 'id\u001b]0;unsafe\u0007\u0085\u202e',
          htmlRequestId: 'page\u001b]0;unsafe\u0007\u0085\u202e',
          route: '/safe\u001b]0;unsafe\u0007\u0085\u202e',
          fetches: [
            {
              durationMs: 1,
              statusCode: 200,
              cacheStatus: 'miss\u001b]0;unsafe\u0007\u0085\u202e',
              method: 'GET\u0007\u0085\u202e',
              url: 'https://example.com/fetch\u001b]0;unsafe\u0007\u0085\u202e',
            },
          ],
        },
      ],
    })
    expect(escaped.result.code).toBe(0)
    expect(escaped.result.stdout).toContain('/safe\\u001b]0;unsafe\\u0007')
    expect(escaped.result.stdout).toContain('\\u0085\\u202e')
    expect(escaped.result.stdout).not.toContain('\u001b')
    expect(escaped.result.stdout).not.toContain('\u0085')
    expect(escaped.result.stdout).not.toContain('\u202e')

    const escapedJson = await runWithResponse(
      {
        requests: [
          {
            ...createRequest(1),
            route: '/safe\u0085\u202e',
          },
        ],
      },
      ['--json']
    )
    expect(escapedJson.result.code).toBe(0)
    expect(escapedJson.result.stdout).toContain('/safe\\u0085\\u202e')
    expect(escapedJson.result.stdout).not.toContain('\u0085')
    expect(escapedJson.result.stdout).not.toContain('\u202e')

    const expansionText = '\u0085'.repeat(256)
    const expansionSnapshot = {
      requests: Array.from({ length: 60 }, (_, requestIndex) => ({
        ...createRequest(requestIndex),
        spans: Array.from({ length: 100 }, () => ({
          name: expansionText,
          startTime: 0,
        })),
      })),
    }
    expect(Buffer.byteLength(JSON.stringify(expansionSnapshot))).toBeLessThan(
      4 * 1024 * 1024
    )
    const expanded = await runWithResponse(expansionSnapshot, [
      '--json',
      '--limit',
      '200',
    ])
    expect(expanded.result.code).toBe(1)
    expect(expanded.result.stderr).toContain(
      'exceeds the terminal-safe 4194304 byte limit'
    )
  })

  it('rejects credential-bearing dev server URLs without echoing secrets', async () => {
    const result = await next.runCommand([
      'experimental-request-insights',
      '--url',
      'http://user:secret@127.0.0.1:3000',
    ])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Credentials are not allowed')
    expect(result.cliOutput).not.toContain('user')
    expect(result.cliOutput).not.toContain('secret')
  })

  it.each(['localhost:3000', 'https://[', 'ftp://localhost:3000'])(
    'rejects invalid dev server URL %s',
    async (url) => {
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        url,
      ])

      expect(result.code).toBe(1)
      expect(result.stderr).toContain(
        'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
      )
    }
  )

  it('does not echo terminal controls from malformed URLs', async () => {
    const result = await next.runCommand([
      'experimental-request-insights',
      '--url',
      'not-a-url\u001b]0;unsafe\u0007',
    ])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
    )
    expect(result.cliOutput).not.toContain('\u001b')
    expect(result.cliOutput).not.toContain('unsafe')
  })

  it('does not emit terminal controls from valid dev server URLs', async () => {
    const result = await next.runCommand([
      'experimental-request-insights',
      '--url',
      'http://127.0.0.1:1/\u001b]0;unsafe\u0007',
    ])

    expect(result.code).toBe(1)
    expect(result.cliOutput).not.toContain('\u001b')
  })

  it('bounds dev server URLs before parsing credentials', async () => {
    const result = await next.runCommand([
      'experimental-request-insights',
      '--url',
      `http://user:secret@localhost/${'x'.repeat(2048)}`,
    ])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
    )
    expect(result.cliOutput).not.toContain('user')
    expect(result.cliOutput).not.toContain('secret')
  })

  it.each([
    { body: { requests: null }, args: ['--json'] },
    { body: { requests: [{ fetches: null }] }, args: [] },
    {
      body: {
        requests: [{ ...createRequest(1), requestId: 'x'.repeat(129) }],
      },
      args: [],
    },
    {
      body: {
        requests: [{ ...createRequest(1), status: 'ok\u001b]0;unsafe\u0007' }],
      },
      args: [],
    },
    {
      body: {
        requests: [createRequest(1)],
        projection: {
          omittedRequestGroupCount: 2,
          buckets: [{ bucket: 'page', omittedRequestGroupCount: 1 }],
        },
      },
      args: ['--json'],
    },
    {
      body: {
        requests: [
          {
            ...createRequest(1, 1),
            fetches: [
              {
                ...createRequest(1, 1).fetches[0],
                method: 42,
              },
            ],
          },
        ],
      },
      args: [],
    },
  ])('rejects malformed responses', async ({ body, args }) => {
    const { result } = await runWithResponse(body, args)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'expected a valid Request Insights snapshot'
    )
  })
})
