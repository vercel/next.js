import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { type Collector, connectCollector } from './collector'

const COLLECTOR_PORT = 9876

describe('otel-parent-span-propagation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
    env: {
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })

  if (skipped) {
    return
  }

  let collector: Collector

  beforeEach(async () => {
    collector = await connectCollector({ port: COLLECTOR_PORT })
  })

  afterEach(async () => {
    await collector.shutdown()
  })

  // Verifies that http.route is set on the handleRequest span.
  // In production, when external OTEL instrumentation (e.g. Datadog,
  // @opentelemetry/instrumentation-http) creates a parent HTTP server span,
  // our fix also propagates http.route to that parent span so APM tools
  // derive the resource name correctly (e.g. "GET /[slug]" instead of "GET").
  // Parent span propagation is verified manually in production environments.
  it('should set http.route on handleRequest span for dynamic routes', async () => {
    await next.fetch('/test-slug')

    await retry(async () => {
      const spans = collector.getSpans()

      const handleRequestSpan = spans.find(
        (s) =>
          s.attributes?.['next.span_type'] === 'BaseServer.handleRequest' &&
          s.attributes?.['http.target'] === '/test-slug'
      )
      expect(handleRequestSpan).toBeDefined()
      expect(handleRequestSpan!.attributes?.['http.route']).toBe('/[slug]')
      expect(handleRequestSpan!.attributes?.['next.route']).toBe('/[slug]')
      expect(handleRequestSpan!.name).toBe('GET /[slug]')
    })
  })

  it('should set http.route on handleRequest span for static routes', async () => {
    await next.fetch('/')

    await retry(async () => {
      const spans = collector.getSpans()

      const handleRequestSpan = spans.find(
        (s) =>
          s.attributes?.['next.span_type'] === 'BaseServer.handleRequest' &&
          s.attributes?.['http.target'] === '/'
      )
      expect(handleRequestSpan).toBeDefined()
      expect(handleRequestSpan!.attributes?.['http.route']).toBe('/')
      expect(handleRequestSpan!.attributes?.['next.route']).toBe('/')
      expect(handleRequestSpan!.name).toBe('GET /')
    })
  })
})
