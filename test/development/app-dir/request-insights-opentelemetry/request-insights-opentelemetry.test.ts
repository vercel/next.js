import { nextTestSetup } from 'e2e-utils'
import { retry, toggleDevToolsIndicatorPopover } from 'next-test-utils'

type Attributes = Record<string, string | number | boolean>

type RequestInsight = {
  requestId: string
  kind?: 'request' | 'instant-insights'
  route: string
  spans: Array<{
    name?: string
    category: 'nextjs' | 'application' | 'opentelemetry'
    traceId?: string
    spanId?: string
    parentSpanId?: string
    durationMs?: number
    attributes?: Attributes
    events?: Array<{ name: string; attributes?: Attributes }>
    links?: Array<{ traceId: string; spanId: string; attributes?: Attributes }>
  }>
}

// 1.x reports the parent as `parentSpanId`, 2.x as `parentSpanContext`.
describe.each([
  ['1.x', '1.30.1'],
  ['2.x', '2.12.0'],
])('request insights with OpenTelemetry SDK %s', (_, sdkVersion) => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@opentelemetry/api': '1.9.0',
      '@opentelemetry/sdk-trace-node': sdkVersion,
    },
  })

  async function getOtelSpanRequest() {
    const { requests } = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as { requests: RequestInsight[] }
    const request = requests.find(
      (candidate) =>
        candidate.route === '/api/otel-span' &&
        candidate.kind !== 'instant-insights'
    )
    expect(request).toBeDefined()
    return request!
  }

  async function openRequestInsightsPanel(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    await toggleDevToolsIndicatorPopover(browser)
    await browser.elementByCss('[data-request-insights]').click()
    await browser.waitForElementByCss('.request-insights-list-toolbar')
    // The selector menu's click-outside handler would close the panel until
    // its exit animation unmounts it.
    await retry(async () => {
      expect(
        await browser.eval(
          () =>
            !document
              .querySelector('nextjs-portal')
              ?.shadowRoot?.querySelector('#nextjs-dev-tools-menu')
        )
      ).toBe(true)
    })
  }

  beforeAll(async () => {
    const response = await next.fetch('/api/otel-span')
    if (!response.ok) {
      throw new Error(`/api/otel-span responded ${response.status}`)
    }
  })

  it('records application spans from the SDK', async () => {
    await retry(async () => {
      const request = await getOtelSpanRequest()
      const redis = request.spans.find((span) => span.name === 'redis GET')
      const replica = request.spans.find(
        (span) => span.name === 'replica lookup'
      )

      expect(redis).toMatchObject({
        category: 'opentelemetry',
        attributes: {
          'db.operation.name': 'GET',
          'db.pool.idle': 3,
          'db.query.summary': 'GET account:123',
        },
        events: [
          {
            name: 'redis event',
            attributes: { 'db.event.detail': 'cache miss' },
          },
        ],
        links: [
          {
            traceId: replica?.traceId,
            spanId: replica?.spanId,
            attributes: { 'db.link.role': 'replica' },
          },
        ],
      })
      expect(redis?.durationMs).toBeCloseTo(5)
      expect(replica?.attributes).toEqual({
        'url.full': 'https://replica.example.com/lookup?query=redacted',
        'url.query': 'redacted',
      })

      // The SDK parents the span under the active Next.js span, which Request
      // Insights records under the same span ID.
      const parent = request.spans.find(
        (span) => span.spanId === redis?.parentSpanId
      )
      expect(parent?.attributes?.['next.span_type']).toEqual(expect.any(String))
    })
  })

  it('does not record Next.js spans twice', async () => {
    await retry(async () => {
      const request = await getOtelSpanRequest()
      const otelSpanNames = request.spans
        .filter((span) => span.category === 'opentelemetry')
        .map((span) => span.name)
        .sort()
      expect(otelSpanNames).toEqual(['redis GET', 'replica lookup'])
    })
  })

  it('shows SDK spans in the Request Insights panel', async () => {
    const browser = await next.browser('/')
    await openRequestInsightsPanel(browser)
    await browser.elementByCss('.request-insights-filter-trigger').click()
    await browser
      .elementByCss(
        '.request-insights-filter-item[data-filter-value="activity:opentelemetry"]'
      )
      .click()

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const rows = Array.from(
          root?.querySelectorAll<HTMLButtonElement>('.request-insights-row') ??
            []
        )
        const row = rows.find((candidate) =>
          candidate.textContent?.includes('/api/otel-span')
        )
        row?.click()
        return { rowCount: rows.length, selected: row !== undefined }
      })
      expect(state).toEqual({ rowCount: 1, selected: true })
    })

    await retry(async () => {
      const colors = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const color = (category: string) => {
          const marker = root?.querySelector<HTMLElement>(
            `.request-insights-span-marker[data-category="${category}"]`
          )
          return marker ? getComputedStyle(marker).backgroundColor : null
        }
        return {
          nextjs: color('nextjs'),
          opentelemetry: color('opentelemetry'),
        }
      })
      expect(colors.nextjs).not.toBeNull()
      expect(colors.opentelemetry).not.toBeNull()
      expect(colors.opentelemetry).not.toBe(colors.nextjs)
    })

    await retry(async () => {
      const state = await browser.eval(() => {
        const root = document.querySelector('nextjs-portal')?.shadowRoot
        const row = Array.from(
          root?.querySelectorAll<HTMLElement>(
            '.request-insights-span-row[data-category="opentelemetry"]'
          ) ?? []
        ).find((candidate) => candidate.textContent?.includes('redis GET'))
        row?.click()
        return {
          label: row?.querySelector('.request-insights-span-attribute-label')
            ?.textContent,
          inspectorOpen:
            root
              ?.querySelector('.request-insights-trace')
              ?.getAttribute('data-inspector-open') === 'true',
          inspectorText:
            root?.querySelector('.request-insights-trace-inspector')
              ?.textContent ?? '',
        }
      })
      expect(state.label).toBe('GET account:123')
      expect(state.inspectorOpen).toBe(true)
      expect(state.inspectorText).toContain('db.pool.idle')
      expect(state.inspectorText).toContain('GET account:123')
    })

    await browser
      .elementByCss('.request-insights-trace-inspector-close')
      .click()
    await retry(async () => {
      expect(
        await browser.eval(() =>
          document
            .querySelector('nextjs-portal')
            ?.shadowRoot?.querySelector('.request-insights-trace-inspector')
        )
      ).toBeNull()
    })
  })
})
