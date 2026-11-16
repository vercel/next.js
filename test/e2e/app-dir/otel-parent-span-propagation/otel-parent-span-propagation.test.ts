import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { type Collector, connectCollector } from './collector'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('otel-parent-span-propagation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: require('./package.json').dependencies,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })

  let collector: Collector

  beforeAll(async () => {
    collector = await connectCollector()
    next.env.TEST_OTEL_COLLECTOR_PORT = String(collector.port)
    await next.start()
  })

  beforeEach(() => {
    collector.reset()
  })

  afterAll(async () => {
    await collector?.shutdown()
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
