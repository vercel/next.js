import { createServer, type Server } from 'node:http'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

import { type Collector, connectCollector } from './collector'

const COLLECTOR_PORT = 9005
const UPSTREAM_PORT = 9006

describe('opentelemetry - fetch span status', () => {
  let collector: Collector
  let upstream: Server

  beforeAll(async () => {
    // A tiny upstream that responds with the status code in the path.
    upstream = createServer((req, res) => {
      const status = Number(req.url?.split('/').pop())
      res.statusCode = status
      res.end(`status ${status}`)
    })
    await new Promise<void>((resolve) =>
      upstream.listen(UPSTREAM_PORT, resolve)
    )
  })

  afterAll(async () => {
    await new Promise((resolve) => upstream.close(resolve))
  })

  beforeEach(async () => {
    collector = await connectCollector({ port: COLLECTOR_PORT })
  })

  afterEach(async () => {
    await collector.shutdown()
  })

  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
    env: {
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
      TEST_FETCH_STATUS_UPSTREAM_PORT: String(UPSTREAM_PORT),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })

  it('should mark AppRender.fetch spans of failed responses as ERROR', async () => {
    const $ = await next.render$('/app/param/fetch-status')
    expect($('#statuses').text()).toBe('200,404,503')

    const getFetchSpan = (status: number) =>
      collector
        .getSpans()
        .find(
          (span) =>
            span.attributes?.['next.span_type'] === 'AppRender.fetch' &&
            span.attributes?.['http.url'] ===
              `http://localhost:${UPSTREAM_PORT}/status/${status}`
        )

    await retry(() => {
      expect(getFetchSpan(200)).toBeDefined()
      expect(getFetchSpan(404)).toBeDefined()
      expect(getFetchSpan(503)).toBeDefined()
    })

    // Successful responses are left unset, per OpenTelemetry semantic
    // conventions for client spans.
    expect(getFetchSpan(200).attributes['http.status_code']).toBe(200)
    expect(getFetchSpan(200).status).toEqual({ code: 0 })

    expect(getFetchSpan(404).attributes['http.status_code']).toBe(404)
    expect(getFetchSpan(404).status).toEqual({
      code: 2,
      message: 'HTTP 404',
    })

    expect(getFetchSpan(503).attributes['http.status_code']).toBe(503)
    expect(getFetchSpan(503).status).toEqual({
      code: 2,
      message: 'HTTP 503',
    })
  })
})
