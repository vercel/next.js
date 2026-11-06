import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { RequestInsight } from 'next/dist/shared/lib/request-insights'

describe.each(['.next', 'tooling-output'])(
  'tooling Request Insights (%s)',
  (distDir) => {
    const bundlerFlag = process.env.IS_WEBPACK_TEST
      ? '--webpack'
      : '--turbopack'
    const { next } = nextTestSetup({
      files: __dirname,
      startCommand: `node node_modules/next/dist/bin/next ${bundlerFlag}`,
      env: {
        NEXT_EXPERIMENTAL_OTEL_TOOLING: '0',
        NEXT_EXIT_TIMEOUT_MS: '30000',
        TOOLING_DIST_DIR: distDir,
      },
    })

    it('records startup, compilation, history and HMR without an application provider', async () => {
      expect(await next.render('/')).toContain('hello world')
      const snapshot = (await (
        await next.fetch('/_next/development/request-insights')
      ).json()) as { requests: RequestInsight[] }
      const startup = snapshot.requests.find(
        (request) =>
          request.kind === 'tooling' && request.route === 'start-dev-server'
      )
      expect(startup).toBeDefined()
      expect(startup!.completedAt).toEqual(expect.any(Number))
      expect(
        startup!.spans.some((span) => span.name === 'setup-dev-bundler')
      ).toBe(true)
      expect(
        snapshot.requests.some(
          (request) =>
            request.kind === 'request' &&
            request.spans.some(
              (span) => span.attributes?.['next.span_type'] === 'compile-path'
            )
        )
      ).toBe(true)
      const history = (await (
        await next.fetch(
          '/_next/development/request-insights?view=history&limit=100'
        )
      ).json()) as { requests: RequestInsight[] }
      expect(
        history.requests.some(
          (request) => request.requestId === startup!.requestId
        )
      ).toBe(true)
      const detail = (await (
        await next.fetch(
          `/_next/development/request-insights?view=detail&kind=tooling&requestId=${startup!.requestId}`
        )
      ).json()) as { request: RequestInsight }
      expect(detail.request.kind).toBe('tooling')

      const browser = await next.browser('/')
      await browser.eval(`
      window.__toolingHmrDocument = true
      window.__NEXT_HMR_LATENCY_CB = (latency) => {
        window.__toolingHmrLatency = latency
      }
    `)
      const editStartedAt = Date.now()
      await next.patchFile('app/page.tsx', (source) =>
        source.replace('hello world', 'edited page')
      )
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('edited page')
        expect(await browser.eval('window.__toolingHmrDocument')).toBe(true)
        expect(await browser.eval('window.__toolingHmrLatency')).toEqual(
          expect.any(Number)
        )
      })
      await retry(async () => {
        const snapshot = (await (
          await next.fetch('/_next/development/request-insights')
        ).json()) as { requests: RequestInsight[] }
        const hmr = snapshot.requests.find(
          (request) =>
            request.kind === 'tooling' &&
            request.route === 'client-hmr-latency' &&
            request.startTime >= editStartedAt - 10
        )
        expect(hmr).toBeDefined()
        expect(hmr!.completedAt).toEqual(expect.any(Number))
        expect(hmr!.spans).toHaveLength(1)
        expect(hmr!.requestId).not.toBe(startup!.requestId)
      })
      await browser.close()
    })
  }
)
