import type * as Playwright from 'playwright'
import type { ChildProcess } from 'child_process'
import { createRouterAct } from 'router-act'
import { findPort } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import { startFakeCDN, type FakeCDN } from '../../../../lib/fake-cdn.mjs'
import { proxyRedirects } from './server.mjs'

// This suite runs Next.js behind an in-process fake CDN on local ports.
// @force-gate !deploy
// @force-gate prefetching
describe('segment cache (CDN cache busting)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // TODO(runtime-ppr): add tests for runtime prefetches

  // To debug these tests locally, run:
  //   node start.mjs
  //
  // This will start the Next app and also a proxy server that simulates a CDN.
  // Like certain real-world CDNs, our fake CDN doesn't respect the Vary header.
  // It only uses the URL.
  let nextChild: ChildProcess | undefined
  let nextExit: Promise<any> | undefined
  let cdn: FakeCDN | undefined
  let port: number

  beforeAll(async () => {
    await next.build()
    const nextPort = await findPort()

    let resolveReady!: () => void
    const readyPromise = new Promise<void>((r) => (resolveReady = r))
    nextExit = next
      .runCommand(['start', '-p', String(nextPort)], {
        onStdout(msg) {
          if (/Ready/.test(msg)) resolveReady()
        },
        instance(p) {
          nextChild = p
        },
      })
      .finally(() => resolveReady())
    await readyPromise

    cdn = await startFakeCDN({ destPort: nextPort, redirects: proxyRedirects })
    port = cdn.port
  })

  afterAll(async () => {
    await cdn?.close()
    nextChild?.kill()
    await nextExit?.catch(() => {})
  })

  it(
    "perform fully prefetched navigation with a CDN that doesn't respect " +
      'the Vary header',
    async () => {
      let act
      const browser = await next.browser('/', {
        baseUrl: port,
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      await act(async () => {
        const link = await browser.elementByCss('a[href="/target-page"]')
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )

  it(
    'prevent cache poisoning attacks by responding with a redirect to correct ' +
      'cache busting query param if a custom header is sent during a prefetch ' +
      'without a corresponding cache-busting search param',
    async () => {
      const browser = await next.browser('/', { baseUrl: port })
      const { status, responseUrl, redirected } = await browser.eval(
        async () => {
          const res = await fetch('/target-page', {
            headers: {
              rsc: '1',
              'next-router-prefetch': '1',
              'next-router-segment-prefetch': '/_tree',
            },
          })
          return {
            status: res.status,
            responseUrl: res.url,
            redirected: res.redirected,
          }
        }
      )
      expect(status).toBe(200)
      expect(responseUrl).toContain('_rsc=')
      expect(redirected).toBe(true)
    }
  )

  it('ignores invalid RSC header values when serving a document request', async () => {
    const url = new URL(`http://localhost:${port}/target-page`)
    url.searchParams.set('test', 'invalid-rsc-header')

    const invalidHeaderRes = await fetch(url, {
      headers: {
        rsc: '0',
      },
    })

    expect(invalidHeaderRes.status).toBe(200)
    expect(invalidHeaderRes.headers.get('content-type')).toContain('text/html')
    expect(await invalidHeaderRes.text()).toContain(
      '<div id="target-page">Target page</div>'
    )

    const htmlRes = await fetch(url)

    expect(htmlRes.status).toBe(200)
    expect(htmlRes.headers.get('content-type')).toContain('text/html')
    expect(await htmlRes.text()).toContain(
      '<div id="target-page">Target page</div>'
    )
  })

  it(
    'perform fully prefetched navigation when a third-party proxy ' +
      'performs a redirect',
    async () => {
      let act
      const browser = await next.browser('/', {
        baseUrl: port,
        beforePageLoad(p: Playwright.Page) {
          act = createRouterAct(p)
        },
      })

      await act(
        async () => {
          const linkToggle = await browser.elementByCss(
            '[data-link-accordion="/redirect-to-target-page"]'
          )
          await linkToggle.click()
        },
        {
          includes: 'Target page',
        }
      )

      await act(async () => {
        const link = await browser.elementByCss(
          'a[href="/redirect-to-target-page"]'
        )
        await link.click()

        const div = await browser.elementById('target-page')
        expect(await div.text()).toBe('Target page')
      }, 'no-requests')
    }
  )
})
