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
  htmlRequestId: string
  route: string
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

  it('records Server Actions without treating client cache calls as actions', async () => {
    const actionIds: string[] = []
    const browser = await next.browser('/server-actions', {
      beforePageLoad(page) {
        page.route('**/server-actions**', async (route) => {
          const actionId = (await route.request().allHeaders())['next-action']
          if (actionId) {
            actionIds.push(actionId)
          }
          await route.continue()
        })
      },
    })

    await browser.elementById('run-tracked-server-action').click()
    await retry(async () => {
      expect(await browser.elementById('server-action-result').text()).toBe(
        'server-action-complete'
      )
    })

    let snapshotAfterAction: { requests: RequestInsight[] } = { requests: [] }
    await retry(async () => {
      snapshotAfterAction = (await next
        .fetch('/_next/development/request-insights')
        .then((response) => response.json())) as {
        requests: RequestInsight[]
      }
      const actionRequests = snapshotAfterAction.requests.filter(
        (request) =>
          request.route === '/server-actions' &&
          request.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] ===
              'AppRender.executeServerAction'
          )
      )
      expect(actionRequests).toHaveLength(1)
      expect(actionRequests[0].requestId).not.toBe(
        actionRequests[0].htmlRequestId
      )
      expect(
        snapshotAfterAction.requests.some(
          (request) => request.requestId === actionRequests[0].htmlRequestId
        )
      ).toBe(true)

      const actionSpans = actionRequests[0].spans.filter(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'AppRender.executeServerAction'
      )
      expect(actionSpans).toEqual([
        expect.objectContaining({
          name: 'AppRender.executeServerAction',
          attributes: expect.objectContaining({
            'next.span_category': 'application',
            'next.span_name': 'run Server Action trackedServerAction',
            'next.span_type': 'AppRender.executeServerAction',
            'next.server_action.name': 'trackedServerAction',
            'next.server_action.file': 'app/server-actions/actions.ts',
          }),
        }),
      ])

      const spansById = new Map(
        actionRequests[0].spans
          .filter((span) => span.spanId)
          .map((span) => [span.spanId!, span])
      )
      let parentSpanId = actionSpans[0].parentSpanId
      let hasRequestAncestor = false
      while (parentSpanId) {
        const parent = spansById.get(parentSpanId)
        if (!parent) break
        if (
          parent.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
        ) {
          hasRequestAncestor = true
          break
        }
        parentSpanId = parent.parentSpanId
      }
      expect(hasRequestAncestor).toBe(true)

      const serializedRequest = JSON.stringify(actionRequests[0])
      expect(serializedRequest).not.toContain('private-server-action-argument')
      expect(actionIds).toHaveLength(1)
      expect(actionIds[0]).toMatch(/^[0-9a-f]{42}$/)
      expect(serializedRequest).not.toContain(actionIds[0])
    })

    const actionRequest = snapshotAfterAction.requests.find(
      (request) =>
        request.route === '/server-actions' &&
        request.spans.some(
          (span) =>
            span.attributes?.['next.server_action.name'] ===
            'trackedServerAction'
        )
    )!
    const existingRequestIds = new Set(
      snapshotAfterAction.requests.map((request) => request.requestId)
    )
    await browser.elementById('run-client-cached-function').click()
    await retry(async () => {
      expect(await browser.elementById('server-action-result').text()).toBe(
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
          !existingRequestIds.has(request.requestId) &&
          request.route === '/server-actions' &&
          request.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] ===
                'BaseServer.handleRequest' &&
              span.attributes?.['http.method'] === 'POST'
          )
      )
      expect(cacheRequests).toHaveLength(1)
      expect(cacheRequests[0].htmlRequestId).toBe(actionRequest.htmlRequestId)
      expect(
        cacheRequests[0].spans.filter(
          (span) =>
            span.attributes?.['next.span_type'] ===
            'AppRender.executeServerAction'
        )
      ).toHaveLength(0)
      expect(actionIds).toHaveLength(2)
      expect(actionIds[1]).toMatch(/^[0-9a-f]{42}$/)
      expect(JSON.stringify(cacheRequests[0])).not.toContain(actionIds[1])
    })

    const panelBrowser = await next.browser('/server-actions')
    await openRequestInsightsPanel(panelBrowser)
    await retry(async () => {
      const actionSpanVisible = await panelBrowser.eval(async () => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const requestRows = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        ).filter(
          (row) =>
            row.textContent?.includes('/server-actions') &&
            !row.textContent.includes('Page load')
        )

        for (const requestRow of requestRows) {
          requestRow.click()
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          )

          if (
            Array.from(
              root?.querySelectorAll('.request-insights-span-row') ?? []
            ).some((row) =>
              row.textContent?.includes('run Server Action trackedServerAction')
            )
          ) {
            return true
          }
        }

        return false
      })
      expect(actionSpanVisible).toBe(true)
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
      const nestedRows = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        return Array.from(
          root?.querySelectorAll('.request-insights-row[data-nested="true"]') ??
            []
        ).map((row) => ({
          internal: row.getAttribute('data-internal'),
          hasArrow: !!row.querySelector('.request-insights-nested-arrow'),
          label: row.textContent ?? '',
        }))
      })

      expect(await getSettingsMenuItems()).toEqual([
        { label: 'Internal activity', checked: 'true' },
        { label: 'Verbose traces', checked: 'true' },
      ])
      expect(nestedRows.length).toBeGreaterThan(0)
      for (const row of nestedRows) {
        expect(row.internal).toBe('true')
        expect(row.hasArrow).toBe(true)
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
        { label: 'Internal activity', checked: 'true' },
        { label: 'Verbose traces', checked: 'true' },
      ])
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
