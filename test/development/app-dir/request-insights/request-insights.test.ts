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
  status: 'ok'
  spans: Array<{
    name?: string
    spanId?: string
    parentSpanId?: string
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
  const { next } = nextTestSetup({
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
      expect(request?.fetches).toEqual([
        expect.objectContaining({
          url: 'data:text/plain,instant insights',
        }),
      ])
      expect(instantInsights?.fetches).toEqual([
        expect.objectContaining({
          url: 'data:text/plain,instant insights',
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
