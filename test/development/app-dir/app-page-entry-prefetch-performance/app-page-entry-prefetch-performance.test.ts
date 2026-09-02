import { nextTestSetup } from 'e2e-utils'

const backgroundRoutes = [
  '/contacts',
  '/emails',
  '/templates',
  '/workflows',
  '/metrics',
  '/logs',
  '/api-keys',
  '/domain',
  '/webhooks',
  '/integrations',
  '/smtp',
  '/settings',
]

describe('app-page entry prefetch performance', () => {
  const traceEnv = process.env.NEXT_TURBOPACK_TRACING
    ? {
        NEXT_TURBOPACK_TRACING: process.env.NEXT_TURBOPACK_TRACING,
        ...(process.env.NEXT_TURBOPACK_TRACING_PATH
          ? {
              NEXT_TURBOPACK_TRACING_PATH:
                process.env.NEXT_TURBOPACK_TRACING_PATH,
            }
          : {}),
      }
    : {}

  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: traceEnv,
    skipStart: true,
  })

  beforeAll(async () => {
    await next.start()
  })

  if (!isTurbopack) {
    it('renders the route-specific app-page entry', async () => {
      const $ = await next.render$('/dashboard/agent-inbox')
      expect($('#agent-inbox').text()).toBe('agent-inbox')
    })

    it.skip('requires Turbopack tracing', () => {})
    return
  }

  it('navigates to agent inbox with many visible route prefetches', async () => {
    const browser = await next.browser('/dashboard')

    expect(
      await browser.eval(`document.querySelectorAll('nav a').length`)
    ).toBe(14)
    expect(await browser.elementByCss('#overview').text()).toBe('overview')
    expect(
      await browser.eval(`document.querySelectorAll('link[rel="icon"]').length`)
    ).toBe(1)

    // Link viewport prefetches are production-only in this checkout. Start the
    // same endpoint compilation batch explicitly so the development benchmark
    // deterministically models the source application's partial prefetching.
    const batchStart = performance.now()
    const backgroundCompilations = Promise.all(
      backgroundRoutes.map(async (pathname) => {
        const response = await next.fetch(`/dashboard${pathname}`)
        expect(response.status).toBe(200)
        await response.arrayBuffer()
      })
    )

    await browser.eval(`window.__navigationStart = performance.now()`)
    await browser.elementByCss('a[href="/dashboard/agent-inbox"]').click()
    await browser.waitForElementByCss('#agent-inbox')

    const elapsed = await browser.eval(
      `performance.now() - window.__navigationStart`
    )
    await backgroundCompilations
    const batchElapsed = performance.now() - batchStart

    console.log(
      `cold agent-inbox navigation under route compilation load: ${elapsed.toFixed(2)} ms`
    )
    console.log(
      `12-route app-page compilation batch: ${batchElapsed.toFixed(2)} ms`
    )
  })
})
