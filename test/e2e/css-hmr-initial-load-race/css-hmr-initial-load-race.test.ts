import { nextTestSetup } from 'e2e-utils'
import { gate } from 'next-test-utils'
import { assertCssHmrStartupRecovery } from '../../lib/css-hmr-initial-load-race'

const stylesheet = 'app/globals.css'

// Regression coverage for https://github.com/vercel/next.js/pull/99893.
// These repeated App/Pages races are complemented by a fresh Pages-only fixture
// so an already ensured App route cannot mask missing global Pages observation.
describe('css-hmr-initial-load-race', () => {
  const { next } = nextTestSetup({ files: __dirname })

  for (const [attempt, pathname] of ['/', '/legacy', '/'].entries()) {
    // Requires a local file edit and a development HMR stream.
    // @force-gate dev && turbopack
    it(`reloads a missed startup CSS edit on ${pathname} (attempt ${attempt}), then preserves ordinary CSS HMR`, async () => {
      await next.fetch(pathname)
      await assertCssHmrStartupRecovery(next, pathname, stylesheet)
    })
  }

  // @force-gate dev && turbopack
  it('recovers a Pages race when the first greeting arrives after hydration', async () => {
    await next.fetch('/legacy')
    await assertCssHmrStartupRecovery(next, '/legacy', stylesheet, {
      delayGreetingUntilHydrated: true,
    })
  })

  // @force-gate dev && turbopack
  it('does not reload or refetch CSS on an unchanged initial load', async () => {
    let documentRequests = 0
    let cssRequests = 0
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            documentRequests++
          }
          if (new URL(request.url()).pathname.endsWith('.css')) cssRequests++
        })
      },
    })
    await browser.elementByCss('#counter').click()
    expect(await browser.elementByCss('#counter').text()).toBe('1')
    expect(await browser.eval('window.__nextHmrInitialVersion')).toMatch(
      /^\d+$/
    )
    expect(documentRequests).toBe(1)
    expect(cssRequests).toBe(1)
  })

  it('emits the initial baseline only in dev-server HTML with Turbopack HMR', async () => {
    const hasHmr = await gate('dev && turbopack')
    for (const path of ['/', '/legacy']) {
      const response = await next.fetch(path)
      expect(response.status).toBe(200)
      const html = await response.text()
      if (hasHmr) {
        expect(html).toMatch(/var __nextHmrInitialVersion="\d+";/)
      } else {
        expect(html).not.toContain('__nextHmrInitialVersion')
      }
      const browser = await next.browser(path)
      const version = await browser.eval('window.__nextHmrInitialVersion')
      if (hasHmr) expect(version).toMatch(/^\d+$/)
      else expect(version).toBeUndefined()
      await browser.elementByCss('#counter').click()
      expect(await browser.elementByCss('#counter').text()).toBe('1')
    }
  })

  // CSP nonce extraction is meaningful on the self-hosted dev server.
  // @force-gate dev && turbopack
  it('reuses the bootstrap CSP nonce for the inline baseline', async () => {
    const policy = "script-src 'self' 'nonce-hmr-baseline-test' 'unsafe-eval'"
    for (const path of ['/', '/legacy']) {
      const response = await next.fetch(path, {
        headers: { 'Content-Security-Policy': policy },
      })
      const html = await response.text()
      const scripts = Array.from(
        html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)
      )
      const baseline = scripts.find(([, , content]) =>
        content.includes('var __nextHmrInitialVersion=')
      )
      expect(baseline).toBeDefined()
      expect(baseline[1]).toContain('nonce="hmr-baseline-test"')
    }
  })
})
