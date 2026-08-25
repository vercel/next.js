import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import {
  retry,
  toggleDevToolsIndicatorPopover,
  waitForNoRedbox,
} from 'next-test-utils'

type RequestInsight = {
  requestId: string
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
  htmlRequestId: string
  route: string
  url?: string
  startTime: number
  completedAt?: number
  status: 'ok'
  spans: Array<{
    name?: string
    traceId?: string
    spanId?: string
    parentSpanId?: string
    durationMs?: number
    status?: 'ok' | 'error'
    attributes?: Record<string, string | number | boolean>
  }>
  fetches: Array<{
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
    })
    shouldResetRequestInsightsConfig = false
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
      /No request insights captured yet|retained requests \(newest first\)/
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

  it('loads completed requests from session history and fetches details lazily', async () => {
    const response = await next.fetch('/api/proxied-page?history-endpoint=1')
    expect(response.status).toBe(200)

    await retry(async () => {
      const historyResponse = await next.fetch(
        '/_next/development/request-insights?view=history&limit=1&showInternal=1'
      )
      expect(historyResponse.headers.get('cache-control')).toBe(
        'private, no-store'
      )
      const history = (await historyResponse.json()) as {
        requests: Array<{
          requestId: string
          kind?: 'request' | 'instant-insights'
          completedAt?: number
          spanCount: number
        }>
        nextCursor?: string
        sessionId: string
      }
      expect(history.sessionId).toEqual(expect.any(String))
      expect(history.requests).toHaveLength(1)
      expect(history.requests[0]).toEqual(
        expect.objectContaining({
          completedAt: expect.any(Number),
          spanCount: expect.any(Number),
        })
      )

      const summary = history.requests[0]
      const detailResponse = await next.fetch(
        `/_next/development/request-insights?view=detail&requestId=${encodeURIComponent(summary.requestId)}&kind=${summary.kind ?? 'request'}`
      )
      expect(detailResponse.status).toBe(200)
      const detail = (await detailResponse.json()) as {
        request: RequestInsight
      }
      expect(detail.request.requestId).toBe(summary.requestId)
      expect(detail.request.spans.length).toBe(summary.spanCount)
    })
  })

  it('records route module loading and preparation spans', async () => {
    const existingRequestIds = new Set(
      (
        (await next
          .fetch('/_next/development/request-insights')
          .then((response) => response.json())) as {
          requests: RequestInsight[]
        }
      ).requests.map((request) => request.requestId)
    )

    const response = await next.fetch('/api/source?route-module-spans=1')
    expect(response.status).toBe(200)
    await response.json()

    await retry(async () => {
      const snapshot = (await next
        .fetch('/_next/development/request-insights')
        .then((insightsResponse) => insightsResponse.json())) as {
        requests: RequestInsight[]
      }
      const matchingRequests = snapshot.requests.filter(
        (request) =>
          !existingRequestIds.has(request.requestId) &&
          request.url === '/api/source?query=redacted' &&
          request.kind !== 'instant-insights'
      )

      expect(matchingRequests).toHaveLength(1)
      const request = matchingRequests[0]
      const loadSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'LoadComponents.loadRouteModule'
      )
      const loadComponentsSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'LoadComponents.loadComponents'
      )
      const prepareSpans = request.spans.filter(
        (span) => span.attributes?.['next.span_type'] === 'RouteModule.prepare'
      )
      const renderResponseComponentsSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'BaseServer.renderToResponseWithComponents'
      )
      const userlandSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'AppRouteRouteModule.loadUserland'
      )
      const manifestSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] === 'RouteModule.loadManifests'
      )

      expect(loadComponentsSpans).toHaveLength(1)
      expect(prepareSpans).toHaveLength(1)
      expect(renderResponseComponentsSpans).toHaveLength(1)
      const rootSpans = request.spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] === 'BaseServer.handleRequest' &&
          span.traceId === prepareSpans[0].traceId
      )
      expect(rootSpans).toHaveLength(1)
      const rootSpan = rootSpans[0]
      expect(loadSpans).toEqual([
        expect.objectContaining({
          name: 'load route module',
          parentSpanId: loadComponentsSpans[0].spanId,
          durationMs: expect.any(Number),
          status: 'ok',
          traceId: rootSpan.traceId,
          attributes: {
            'next.span_category': 'nextjs',
            'next.span_name': 'load route module',
            'next.span_type': 'LoadComponents.loadRouteModule',
          },
        }),
      ])
      expect(prepareSpans).toEqual([
        expect.objectContaining({
          name: 'prepare route module',
          parentSpanId: renderResponseComponentsSpans[0].spanId,
          durationMs: expect.any(Number),
          status: 'ok',
          traceId: rootSpan.traceId,
          attributes: {
            'next.span_category': 'nextjs',
            'next.span_name': 'prepare route module',
            'next.span_type': 'RouteModule.prepare',
          },
        }),
      ])
      expect(userlandSpans).toEqual([
        expect.objectContaining({
          name: 'load app route module',
          parentSpanId: renderResponseComponentsSpans[0].spanId,
          durationMs: expect.any(Number),
          status: 'ok',
          traceId: rootSpan.traceId,
          attributes: {
            'next.route': '/api/source',
            'next.span_category': 'nextjs',
            'next.span_name': 'load app route module',
            'next.span_type': 'AppRouteRouteModule.loadUserland',
          },
        }),
      ])
      expect(manifestSpans).toEqual([
        expect.objectContaining({
          name: 'load route manifests',
          parentSpanId: prepareSpans[0].spanId,
          durationMs: expect.any(Number),
          status: 'ok',
          traceId: rootSpan.traceId,
          attributes: {
            'next.span_category': 'nextjs',
            'next.span_name': 'load route manifests',
            'next.span_type': 'RouteModule.loadManifests',
          },
        }),
      ])

      for (const span of [
        ...loadSpans,
        ...prepareSpans,
        ...userlandSpans,
        ...manifestSpans,
      ]) {
        expect(Number.isFinite(span.durationMs)).toBe(true)
        expect(span.durationMs).toBeGreaterThanOrEqual(0)
      }
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

      const runValidationSpan = pipelineSpans?.find(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'AppRender.instantInsights.runValidation'
      )
      const workerLoadSpan = instantInsights?.spans.find(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'LoadComponents.loadRouteModule'
      )
      if (isTurbopack) {
        const spansById = new Map(
          instantInsights?.spans.flatMap((span) =>
            span.spanId ? [[span.spanId, span] as const] : []
          )
        )
        const expectDescendantOfRunValidation = (
          span: RequestInsight['spans'][number] | undefined
        ) => {
          const visited = new Set<string>()
          let ancestor = span
          while (
            ancestor?.parentSpanId &&
            ancestor.parentSpanId !== runValidationSpan?.spanId
          ) {
            expect(visited.has(ancestor.parentSpanId)).toBe(false)
            visited.add(ancestor.parentSpanId)
            ancestor = spansById.get(ancestor.parentSpanId)
          }
          expect(ancestor?.parentSpanId).toBe(runValidationSpan?.spanId)
        }

        expect(workerLoadSpan).toEqual(
          expect.objectContaining({
            name: 'load route module',
            traceId: runValidationSpan?.traceId,
            status: 'ok',
          })
        )
        expectDescendantOfRunValidation(workerLoadSpan)
      } else {
        // The dev validation worker only runs with Turbopack. Do not invent a
        // worker span for the in-process Webpack validation path.
        expect(workerLoadSpan).toBeUndefined()
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
      diagnosisVisible: boolean
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
          diagnosisVisible: Boolean(
            root?.querySelector('.request-insights-diagnosis')
          ),
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
        diagnosisVisible: false,
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
        diagnosisVisible: true,
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
        diagnosisVisible: true,
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

    await browser.eval(() =>
      Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          fetch(`/api/source?scroll-test=${index}`)
        )
      )
    )
    await openRequestInsightsPanel(browser)

    await retry(async () => {
      const state = await browser.eval(() => {
        document.body.style.minHeight = '300vh'
        window.scrollTo(0, 200)

        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const list = root?.querySelector<HTMLElement>(
          '.request-insights-list-scroll'
        )
        const details = root?.querySelector<HTMLElement>(
          '.request-insights-details'
        )
        const row = root?.querySelector<HTMLElement>('.request-insights-row')
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
          nativeScrollbarWidth: list
            ? getComputedStyle(list).scrollbarWidth
            : null,
          overlayScrollbarVisible: Boolean(
            root?.querySelector('.request-insights-list-scrollbar')
          ),
          rowFillsViewport:
            list && row
              ? row.getBoundingClientRect().right ===
                list.getBoundingClientRect().right
              : false,
          rowContentContained: row
            ? row.scrollHeight <= row.clientHeight
            : false,
          listScrollable: list
            ? list.scrollHeight > list.clientHeight && list.scrollTop > 0
            : false,
          mountedRowCount:
            root?.querySelectorAll('.request-insights-row').length ?? 0,
          pageScrollBefore,
          pageScrollAfter: window.scrollY,
        }
      })

      expect(state).toEqual({
        detailsOverscroll: 'contain',
        listOverflow: 'auto',
        listOverscroll: 'contain',
        nativeScrollbarWidth: 'none',
        overlayScrollbarVisible: true,
        rowContentContained: true,
        rowFillsViewport: true,
        listScrollable: true,
        mountedRowCount: expect.any(Number),
        pageScrollBefore: 200,
        pageScrollAfter: 200,
      })
      expect(state.mountedRowCount).toBeGreaterThan(0)
      expect(state.mountedRowCount).toBeLessThan(80)
    })
  })

  it('hides internal activity behind the settings menu', async () => {
    const browser = await next.browser('/instant-insights')
    shouldResetRequestInsightsConfig = true

    function getSettingsMenuItems(): Promise<
      Array<{ label: string | undefined; checked: string | null }>
    > {
      return browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return Array.from(
          root?.querySelectorAll('.request-insights-settings-item') ?? []
        ).map((item) => ({
          label: item.textContent?.trim(),
          checked:
            item
              .querySelector('.request-insights-settings-checkbox')
              ?.getAttribute('data-checked') ?? null,
        }))
      })
    }

    await openRequestInsightsPanel(browser)

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const rows = Array.from(
          root?.querySelectorAll('.request-insights-row') ?? []
        )
        return {
          rowCount: rows.length,
          hasInstantInsightsRow: rows.some((row) =>
            row.textContent?.includes('Instant Insights')
          ),
        }
      })

      expect(state.rowCount).toBeGreaterThan(0)
      expect(state.hasInstantInsightsRow).toBe(false)
    })

    await browser.elementByCss('.request-insights-settings-trigger').click()
    await retry(async () => {
      expect(await getSettingsMenuItems()).toEqual([
        { label: 'Pause updates', checked: null },
        { label: 'Internal activity', checked: null },
        { label: 'Verbose traces', checked: null },
      ])
    })

    await browser
      .elementByCss(
        '.request-insights-settings-item:has-text("Internal activity")'
      )
      .click()
    await browser
      .elementByCss(
        '.request-insights-settings-item:has-text("Verbose traces")'
      )
      .click()

    await retry(async () => {
      const internalRows = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return Array.from(
          root?.querySelectorAll(
            '.request-insights-row[data-internal="true"]'
          ) ?? []
        ).map((row) => ({
          nested: row.hasAttribute('data-nested'),
          label: row.textContent ?? '',
        }))
      })

      expect(await getSettingsMenuItems()).toEqual([
        { label: 'Pause updates', checked: null },
        { label: 'Internal activity', checked: 'true' },
        { label: 'Verbose traces', checked: 'true' },
      ])
      expect(internalRows.length).toBeGreaterThan(0)
      expect(internalRows.some((row) => row.nested)).toBe(true)
      for (const row of internalRows) {
        expect(row.label).toContain('Instant Insights')
      }
    })

    await retry(async () => {
      const config = JSON.parse(
        await next.readFile('build/dev/cache/next-devtools-config.json')
      )
      expect(config.requestInsights).toEqual({
        showInternal: true,
        verbose: true,
      })
    })

    await browser.elementByCss('.request-insights-details').click()
    await browser.refresh()
    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-settings-trigger').click()

    await retry(async () => {
      expect(await getSettingsMenuItems()).toEqual([
        { label: 'Pause updates', checked: null },
        { label: 'Internal activity', checked: 'true' },
        { label: 'Verbose traces', checked: 'true' },
      ])
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

    const pausedState = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      return {
        rowCount: root?.querySelectorAll('.request-insights-row').length ?? 0,
        filterStatus: root?.querySelector('.request-insights-filter-status')
          ?.textContent,
      }
    })
    expect((await next.fetch('/api/source?while=paused')).status).toBe(200)

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return {
          paused: root?.querySelector('.request-insights-paused-state')
            ?.textContent,
          rowCount: root?.querySelectorAll('.request-insights-row').length ?? 0,
          filterStatus: root?.querySelector('.request-insights-filter-status')
            ?.textContent,
        }
      })
      expect(state).toEqual({
        paused: 'Paused',
        ...pausedState,
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
          filterStatus: root?.querySelector('.request-insights-filter-status')
            ?.textContent,
        }
      })
      expect(state.paused).toBeNull()
      expect(state.filterStatus).not.toBe(pausedState.filterStatus)
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

    const requestHeader = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const copyButton = root?.querySelector<HTMLButtonElement>(
        '.request-insights-summary button'
      )
      return {
        copyButtonCount:
          root?.querySelectorAll('.request-insights-summary button').length ??
          0,
        copyButtonLabel: copyButton?.getAttribute('aria-label') ?? '',
        text:
          root?.querySelector('.request-insights-summary')?.textContent ?? '',
      }
    })
    expect(requestHeader.copyButtonCount).toBe(1)
    expect(requestHeader.copyButtonLabel).toBe('Copy request path')
    expect(requestHeader.text).not.toContain('Request ID')

    await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const row = Array.from(
        root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ?? []
      ).find((candidate) =>
        candidate.textContent?.includes('/products/blue?query=redacted')
      )
      const rect = row?.getBoundingClientRect()
      row?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect?.left ?? 0,
          clientY: rect?.top ?? 0,
        })
      )
    })

    await retry(async () => {
      const menu = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const popup = root?.querySelector<HTMLElement>(
          '.request-insights-context-menu'
        )
        const requestIdPreview = popup?.querySelector<HTMLElement>(
          '.request-insights-context-preview code'
        )
        const requestIdStyle = requestIdPreview
          ? getComputedStyle(requestIdPreview)
          : null
        return {
          label: popup?.getAttribute('aria-label') ?? '',
          requestId: requestIdPreview?.textContent?.trim() ?? '',
          requestIdOverflowWrap: requestIdStyle?.overflowWrap ?? '',
          requestIdTitle: requestIdPreview?.title ?? '',
          text: popup?.textContent ?? '',
          width: popup?.getBoundingClientRect().width ?? 0,
        }
      })

      expect(menu.requestId).not.toBe('')
      expect(menu.label).toBe(`Actions for request ${menu.requestId}`)
      expect(menu.requestIdTitle).toBe(menu.requestId)
      expect(menu.requestIdOverflowWrap).toBe('anywhere')
      expect(menu.text).toContain('/products/blue?query=redacted')
      expect(menu.text).toContain('Copy request ID')
      expect(menu.text).toContain('Copy agent prompt')
      expect(menu.text).not.toContain('Copy page-load ID')
      expect(menu.text).not.toContain('Copy request URL')
      expect(menu.text).not.toContain('Copy request JSON')
      expect(menu.width).toBeLessThanOrEqual(260)
    })

    const openedSecondMenu = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const rows = Array.from(
        root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ?? []
      )
      const row = rows.find(
        (candidate) =>
          !candidate.textContent?.includes('/products/blue?query=redacted')
      )
      const rect = row?.getBoundingClientRect()
      row?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect?.left ?? 0,
          clientY: rect?.top ?? 0,
        })
      )
      return row !== undefined
    })
    expect(openedSecondMenu).toBe(true)

    const selectedRequestMenu = await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const popups = root?.querySelectorAll<HTMLElement>(
          '.request-insights-context-menu'
        )
        return {
          popupCount: popups?.length ?? 0,
          popupLabel: popups?.[0]?.getAttribute('aria-label') ?? '',
          selectedRequestId:
            popups?.[0]
              ?.querySelector('.request-insights-context-preview code')
              ?.textContent?.trim() ?? '',
        }
      })

      expect(state.popupCount).toBe(1)
      expect(state.selectedRequestId).not.toBe('')
      expect(state.popupLabel).toBe(
        `Actions for request ${state.selectedRequestId}`
      )
      return state
    })
    const selectedRequestId = selectedRequestMenu.selectedRequestId

    const clickedOutsideMenu = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const backdrop = root?.querySelector<HTMLElement>(
        '.request-insights-context-backdrop'
      )
      backdrop?.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerType: 'mouse',
        })
      )
      backdrop?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      )
      return Boolean(backdrop)
    })
    expect(clickedOutsideMenu).toBe(true)

    await retry(async () => {
      expect(
        await browser.eval(() => {
          const root = document.querySelector('nextjs-portal')?.shadowRoot
          return root?.querySelectorAll('.request-insights-context-menu').length
        })
      ).toBe(0)
    })

    const openedSpanMenu = await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const testWindow = window as typeof window & {
        __requestInsightsCopiedValue?: string
      }
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            testWindow.__requestInsightsCopiedValue = value
          },
        },
      })
      const row = root?.querySelector<HTMLElement>('.request-insights-span-row')
      const rect = row?.getBoundingClientRect()
      row?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect?.left ?? 0,
          clientY: rect?.top ?? 0,
        })
      )
      return Boolean(row)
    })
    expect(openedSpanMenu).toBe(true)

    const spanMenu = await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const popup = root?.querySelector<HTMLElement>(
          '.request-insights-context-menu'
        )
        return {
          label: popup?.getAttribute('aria-label') ?? '',
          text: popup?.textContent ?? '',
        }
      })

      expect(state.label).toMatch(/^Actions for span .+/)
      expect(state.text).toContain('Copy span ID')
      expect(state.text).toContain('Copy agent prompt')
      return state
    })
    const spanId = spanMenu.label.slice('Actions for span '.length)

    await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const copySpanId = Array.from(
        root?.querySelectorAll<HTMLElement>('.request-insights-context-item') ??
          []
      ).find((item) => item.textContent === 'Copy span ID')
      copySpanId?.click()
    })

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const testWindow = window as typeof window & {
          __requestInsightsCopiedValue?: string
        }
        return {
          copied: testWindow.__requestInsightsCopiedValue,
          popupCount:
            root?.querySelectorAll('.request-insights-context-menu').length ??
            0,
        }
      })
      expect(state.copied).toBe(spanId)
      expect(state.popupCount).toBe(0)
    })

    await browser.eval(() => {
      const root = document.querySelector('nextjs-portal')?.shadowRoot
      const row = root?.querySelector<HTMLElement>('.request-insights-span-row')
      const rect = row?.getBoundingClientRect()
      row?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect?.left ?? 0,
          clientY: rect?.top ?? 0,
        })
      )
    })

    await retry(async () => {
      const clicked = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const copyPrompt = Array.from(
          root?.querySelectorAll<HTMLElement>(
            '.request-insights-context-item'
          ) ?? []
        ).find((item) => item.textContent === 'Copy agent prompt')
        copyPrompt?.click()
        return copyPrompt !== undefined
      })
      expect(clicked).toBe(true)
    })

    await retry(async () => {
      const copied = await browser.eval(() => {
        const testWindow = window as typeof window & {
          __requestInsightsCopiedValue?: string
        }
        return testWindow.__requestInsightsCopiedValue ?? ''
      })
      expect(copied).toContain(selectedRequestId)
      expect(copied).toContain(spanId)
    })
  })

  it('keeps trace inspection anchored while the panel is resized', async () => {
    const browser = await next.browser('/products/blue?tab=details')
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

    await browser
      .locator('nextjs-portal .request-insights-span-row[data-active="true"]')
      .hover()
    await browser.locator('nextjs-portal .request-insights-trace-rows').focus()

    const readTraceState = () =>
      browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const panel = root?.querySelector<HTMLElement>(
          '.request-insights-panel-container'
        )
        const listbox = root?.querySelector<HTMLElement>(
          '.request-insights-trace-rows'
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
          activeDescendant,
          activeRowId: activeRow?.id ?? null,
          activeTraceItemId: activeRow?.dataset.traceItemId ?? null,
          firstRowId: firstRow?.id ?? null,
          activeLabel: activeRow?.getAttribute('aria-label') ?? null,
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
        ?.querySelector<HTMLElement>('.request-insights-trace-rows')
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

    await browser
      .locator('nextjs-portal .request-insights-span-row[data-active="true"]')
      .hover()
    await browser.locator('nextjs-portal .request-insights-trace-rows').focus()

    const switchedState = await expectAnchoredTrace()
    expect(switchedState.activeDescendant).toBe(switchedState.firstRowId)
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
          })
        )
        expect(matchingRequests[0].completedAt).toBeUndefined()
      }, 30_000)
    } finally {
      await retry(async () => {
        const release = await next.fetch(
          `/api/app-stream-lifecycle?release=${waitKey}`,
          { method: 'POST' }
        )
        expect(release.status).toBe(204)
      }, 30_000)
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
      expect(matchingRequests[0].completedAt).toEqual(expect.any(Number))
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

  it('uses the development endpoint and reports truncated output', async () => {
    const { result, requestedPaths } = await runWithResponse(
      {
        requests: [
          createRequest(1),
          createRequest(2),
          { ...createRequest(3, 7), kind: 'instant-insights' },
        ],
      },
      ['--limit', '1']
    )

    expect(result.code).toBe(0)
    expect(requestedPaths).toEqual(['/_next/development/request-insights'])
    expect(result.stdout).toContain(
      'Showing 1 of 3 retained requests (newest first).'
    )
    expect(result.stdout).toContain('/route-3')
    expect(result.stdout).toContain('Instant Insights · /route-3')
    expect(result.stdout).toContain('kind instant-insights')
    expect(result.stdout).not.toContain('/route-2')
    expect(result.stdout).toContain('showing first 5 of 7 fetches')
    expect(result.stdout).toContain('https://example.com/fetch-4')
    expect(result.stdout).not.toContain('https://example.com/fetch-5')
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
        `Invalid dev server URL "${url}". Pass a valid HTTP or HTTPS URL.`
      )
    }
  )

  it.each([
    { body: { requests: null }, args: ['--json'] },
    { body: { requests: [{ fetches: null }] }, args: [] },
  ])('rejects malformed responses', async ({ body, args }) => {
    const { result } = await runWithResponse(body, args)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'expected requests and fetches to be arrays'
    )
  })
})
