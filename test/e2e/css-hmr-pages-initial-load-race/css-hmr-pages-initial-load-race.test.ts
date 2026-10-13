import { nextTestSetup } from 'e2e-utils'
import { assertCssHmrStartupRecovery } from '../../lib/css-hmr-initial-load-race'
import {
  gate,
  getRedboxDescription,
  retry,
  waitForNoRedbox,
  waitForRedbox,
} from 'next-test-utils'

// No App directory or prewarmed route: the first browser loads Pages' global CSS
// through _app. An App route observer must not mask this independent regression.
describe('css-hmr-pages-initial-load-race', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // Requires a local file edit and a development HMR stream.
  // @force-gate dev && turbopack
  it('reloads a missed global CSS edit on the very first Pages navigation', async () => {
    await assertCssHmrStartupRecovery(next, '/', 'global.css')
  })

  // @force-gate dev && turbopack
  it('recovers when the first greeting is delivered only after hydration', async () => {
    await assertCssHmrStartupRecovery(next, '/', 'global.css', {
      delayGreetingUntilHydrated: true,
    })
  })

  // @force-gate dev && turbopack
  it('observes replacement global CSS after ensuring another Page', async () => {
    const originalApp = await next.readFile('pages/_app.tsx')
    let documents = 0
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        await page.addInitScript(() => {
          ;(window as any).__appObserverDocument = crypto.randomUUID()
        })
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            documents++
          }
        })
      },
    })
    const documentId = await browser.eval('window.__appObserverDocument')
    try {
      await browser.elementByCss('#other').click()
      await retry(async () => {
        expect(new URL(await browser.url()).pathname).toBe('/other')
      })
      await browser.elementByCss('#counter').click()
      expect(await browser.elementByCss('#counter').text()).toBe('1')
      await next.patchFile(
        'pages/_app.tsx',
        originalApp.replace('original-app', 'edited-app')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#app-label').text()).toBe(
          'edited-app'
        )
      })
      expect(await browser.elementByCss('#counter').text()).toBe('1')
      expect(await browser.eval('window.__appObserverDocument')).toBe(
        documentId
      )
      expect(documents).toBe(1)
      await next.patchFile(
        'pages/_app.tsx',
        originalApp
          .replace('original-app', 'edited-app')
          .replace('../global.css', '../replacement.css')
      )
      await retry(async () => {
        expect(await browser.elementByCss('#app-label').text()).toBe(
          'edited-app'
        )
      })
      // Removing one CSS dependency and adding another already triggers runtime
      // reloads without this observer. Check the new dependency is live, rather
      // than promising state preservation for that structural change.
      await retry(async () => {
        const hrefs = await browser.eval<string[]>(
          `Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href'))`
        )
        const css = (
          await Promise.all(
            hrefs.map(async (href) => (await next.fetch(href)).text())
          )
        ).join('\n')
        expect(css).toContain('.replacement-marker')
      })
      // No subscribed browser may detect this edit on behalf of the global
      // observer. Its changed CSS dependency must be watched before new HTML.
      await browser.close()
      await assertCssHmrStartupRecovery(next, '/other', 'replacement.css')
    } finally {
      await browser.close()
      await next.patchFile('pages/_app.tsx', originalApp)
    }
  })

  // @force-gate dev && turbopack
  it('keeps global _app compile/runtime issues visible and recovers without a reload loop', async () => {
    const originalApp = await next.readFile('pages/_app.tsx')
    let documents = 0
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            documents++
          }
        })
      },
    })
    try {
      await browser.elementByCss('#counter').click()
      await next.patchFile(
        'pages/_app.tsx',
        `${originalApp}\ninvalid syntax !\n`
      )
      await waitForRedbox(browser)
      // Another ensure must not let observer setup alone clear the global error.
      expect((await next.fetch('/other')).status).toBe(500)
      await waitForRedbox(browser)
      expect(documents).toBe(1)
      await next.patchFile('pages/_app.tsx', originalApp)
      await waitForNoRedbox(browser)
      expect(await browser.elementByCss('#counter').text()).toBe('1')
      expect(documents).toBe(1)
      await next.patchFile(
        'pages/_app.tsx',
        originalApp.replace(
          '  return (',
          "  throw new Error('global-app-runtime-error')\n  return ("
        )
      )
      await waitForRedbox(browser)
      expect(await getRedboxDescription(browser)).toContain(
        'global-app-runtime-error'
      )
      await next.patchFile('pages/_app.tsx', originalApp)
      await waitForNoRedbox(browser)
      expect(await browser.elementByCss('#app-label').text()).toBe(
        'original-app'
      )
      expect(documents).toBe(1)
      await browser.close()
      await assertCssHmrStartupRecovery(next, '/', 'global.css')
    } finally {
      await browser.close()
      await next.patchFile('pages/_app.tsx', originalApp)
    }
  })

  // @force-gate dev && turbopack
  it('establishes a fresh global baseline after configuration replacement', async () => {
    const originalConfig = await next.readFile('next.config.ts')
    try {
      await next.patchFile(
        'next.config.ts',
        `export default {
          async headers() {
            return [{ source: '/:path*', headers: [{ key: 'x-observer-config', value: 'replaced' }] }]
          }
        }`
      )
      await retry(async () => {
        const response = await next.fetch('/')
        expect(response.status).toBe(200)
        expect(response.headers.get('x-observer-config')).toBe('replaced')
      }, 30_000)
      await assertCssHmrStartupRecovery(next, '/', 'global.css')
    } finally {
      await next.patchFile('next.config.ts', originalConfig)
    }
  })

  it('only emits the Pages baseline for actual dev Turbopack HMR', async () => {
    const hasHmr = await gate('dev && turbopack')
    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    const html = await response.text()
    if (hasHmr) expect(html).toMatch(/var __nextHmrInitialVersion="\d+";/)
    else expect(html).not.toContain('__nextHmrInitialVersion')
  })

  // @force-gate dev && turbopack
  it('keeps an unchanged Pages load at one document and one CSS request', async () => {
    let documents = 0
    let stylesheets = 0
    let greeting: string | undefined
    let firstSubscription: string | undefined
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        page.on('request', (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          ) {
            documents++
          }
          if (new URL(request.url()).pathname.endsWith('.css')) stylesheets++
        })
        await page.routeWebSocket(/\/_next\/hmr/, (clientSocket) => {
          const serverSocket = clientSocket.connectToServer()
          serverSocket.onMessage((payload) => {
            if (typeof payload === 'string') {
              const message = JSON.parse(payload)
              if (message.type === 'turbopack-connected') {
                greeting ??= message.data.hmrVersion
              }
            }
            clientSocket.send(payload)
          })
          clientSocket.onMessage((payload) => {
            if (typeof payload === 'string') {
              const message = JSON.parse(payload)
              if (message.type === 'turbopack-subscribe') {
                firstSubscription ??= message.hmrVersion
              }
            }
            serverSocket.send(payload)
          })
        })
      },
    })
    await retry(async () => {
      expect(greeting).toMatch(/^\d+$/)
      expect(firstSubscription).toMatch(/^\d+$/)
    })
    expect(greeting).toBe(await browser.eval('window.__nextHmrInitialVersion'))
    expect(firstSubscription).toBe(greeting)
    await browser.elementByCss('#counter').click()
    expect(await browser.elementByCss('#counter').text()).toBe('1')
    expect(documents).toBe(1)
    expect(stylesheets).toBe(1)
  })
})
