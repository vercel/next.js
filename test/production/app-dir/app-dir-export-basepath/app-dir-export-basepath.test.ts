import { join } from 'path'
import { isNextStart } from 'e2e-utils'
import { findPort, nextBuild, retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import http from 'http'
import handler from 'serve-handler'

describe('app-dir-export-basepath', () => {
  if (!isNextStart) {
    it('build test should not run during dev test run', () => {})
    return
  }

  let server: http.Server
  let port: number

  beforeAll(async () => {
    await nextBuild(__dirname, undefined, { cwd: __dirname })

    const outDir = join(__dirname, 'out')

    // Use serve-handler to serve the static export output under the /docs basePath,
    // mimicking a real deployment (e.g., GitHub Pages) where the app is
    // mounted at /docs.
    server = http.createServer((req, res) => {
      // Strip the basePath prefix so serve-handler can find the files
      if (req.url && req.url.startsWith('/docs')) {
        req.url = req.url.slice('/docs'.length) || '/'
      }
      return handler(req, res, {
        public: outDir,
      })
    })

    port = await findPort()
    await new Promise<void>((resolve) => {
      server.listen(port, resolve)
    })
  })

  afterAll(() => {
    if (server) {
      server.close()
    }
  })

  it('should perform client-side navigation to root page with basePath without 404', async () => {
    // Navigate to /docs/about first (an inner page)
    const browser = await webdriver(port, '/docs/about')

    // Verify we're on the about page
    await retry(async () => {
      const text = await browser.elementByCss('#about-page').text()
      expect(text).toBe('About Page')
    })

    // Set a marker on window to detect if the page does a full reload.
    // If the RSC payload fetch fails, Next.js falls back to MPA navigation
    // (full page reload), which would clear this marker.
    await browser.eval('window.__SPA_NAV_MARKER = true')

    // Click the link to navigate to the root page.
    // This triggers a client-side navigation which fetches the RSC payload.
    // Before the fix, this would request /docs.txt instead of /docs/index.txt,
    // causing a 404 and falling back to MPA navigation.
    await browser.elementByCss('#link-to-home').click()

    await retry(async () => {
      const text = await browser.elementByCss('#home-page').text()
      expect(text).toBe('Home Page')
    })

    // Verify the navigation was a client-side SPA navigation, not a full
    // page reload. If the RSC payload was fetched correctly, the marker
    // should still be on window.
    const marker = await browser.eval('window.__SPA_NAV_MARKER')
    expect(marker).toBe(true)

    await browser.close()
  })

  it('should perform client-side round-trip navigation with basePath without 404', async () => {
    const browser = await webdriver(port, '/docs')

    // Verify we're on the home page
    await retry(async () => {
      const text = await browser.elementByCss('#home-page').text()
      expect(text).toBe('Home Page')
    })

    // Navigate to the about page
    await browser.elementByCss('#link-to-about').click()

    await retry(async () => {
      const text = await browser.elementByCss('#about-page').text()
      expect(text).toBe('About Page')
    })

    // Set marker before navigating back
    await browser.eval('window.__SPA_NAV_MARKER = true')

    // Navigate back to home - this is the critical path that was broken
    await browser.elementByCss('#link-to-home').click()

    await retry(async () => {
      const text = await browser.elementByCss('#home-page').text()
      expect(text).toBe('Home Page')
    })

    // Verify the navigation was client-side (no full page reload)
    const marker = await browser.eval('window.__SPA_NAV_MARKER')
    expect(marker).toBe(true)

    await browser.close()
  })
})
