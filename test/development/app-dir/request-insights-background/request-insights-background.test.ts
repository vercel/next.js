import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { RequestInsight } from 'next/dist/shared/lib/request-insights'

describe.each(['.next', 'custom-output'])(
  'background Request Insights (%s)',
  (distDir) => {
    const bundlerFlag = process.env.IS_WEBPACK_TEST
      ? '--webpack'
      : '--turbopack'
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: `node node_modules/next/dist/bin/next ${bundlerFlag}`,
      env: {
        NEXT_EXIT_TIMEOUT_MS: '30000',
        TEST_DIST_DIR: distDir,
      },
    })

    it('records startup and compilation without an application provider', async () => {
      expect(await next.render('/')).toContain('hello world')
      const snapshot = (await (
        await next.fetch('/_next/development/request-insights')
      ).json()) as { requests: RequestInsight[] }
      const startup = snapshot.requests.find(
        (request) =>
          request.kind === 'background' && request.route === 'start-dev-server'
      )
      expect(startup).toBeDefined()
      expect(startup!.completedAt).toEqual(expect.any(Number))
      const root = startup!.spans.find(
        (span) => span.name === 'start-dev-server'
      )!
      const setup = startup!.spans.find(
        (span) => span.name === 'setup-dev-bundler'
      )!
      expect(root).toBeDefined()
      expect(setup).toBeDefined()
      expect(setup.parentSpanId).toBe(root.spanId)
      expect(setup.traceId).toBe(root.traceId)
      expect(
        snapshot.requests.some(
          (request) =>
            request.kind === 'request' &&
            request.spans.some(
              (span) => span.attributes?.['next.span_type'] === 'compile-path'
            )
        )
      ).toBe(true)
    })

    // Request Insights doesn't instrument webpack's HMR.
    // @force-gate turbopack
    it('records HMR latency as its own background entry', async () => {
      const browser = await next.browser('/')
      await browser.eval(`
      window.__hmrDocument = true
      window.__NEXT_HMR_LATENCY_CB = (latency) => {
        window.__hmrLatency = latency
      }
    `)
      const editStartedAt = Date.now()
      await next.patchFile('app/page.tsx', (source) =>
        source.replace('hello world', 'edited page')
      )
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('edited page')
        expect(await browser.eval('window.__hmrDocument')).toBe(true)
        expect(await browser.eval('window.__hmrLatency')).toEqual(
          expect.any(Number)
        )
      })
      await retry(async () => {
        const snapshot = (await (
          await next.fetch('/_next/development/request-insights')
        ).json()) as { requests: RequestInsight[] }
        const hmr = snapshot.requests.find(
          (request) =>
            request.kind === 'background' &&
            request.route === 'client-hmr-latency' &&
            request.startTime >= editStartedAt - 10
        )
        expect(hmr).toBeDefined()
        expect(hmr!.completedAt).toEqual(expect.any(Number))
        expect(hmr!.spans).toHaveLength(1)
      })
      await browser.close()
    })
  }
)
