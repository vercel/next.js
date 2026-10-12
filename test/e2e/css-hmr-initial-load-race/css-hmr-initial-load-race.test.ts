import { nextTestSetup } from 'e2e-utils'
import { gate, retry } from 'next-test-utils'
import type { Page } from 'playwright'

const stylesheet = 'app/globals.css'
const editedColor = 'rgb(9, 9, 9)'
const laterColor = 'rgb(4, 5, 6)'

// Regression coverage for https://github.com/vercel/next.js/pull/99893.
// Hold JavaScript so the old CSS body finishes before the edit and before any
// browser HMR subscription can start. The patch helper's bounded watcher delay
// is safe here because JavaScript remains blocked until the patch completes.
// This race requires a local stylesheet edit and a development HMR stream.
describe('css-hmr-initial-load-race', () => {
  const { next } = nextTestSetup({ files: __dirname })

  for (const [attempt, pathname] of ['/', '/legacy', '/'].entries()) {
    // Requires a local file edit and a development HMR stream.
    // @force-gate dev && turbopack
    it(`reloads a missed startup CSS edit on ${pathname} (attempt ${attempt}), then preserves ordinary CSS HMR`, async () => {
      const originalCss = await next.readFile(stylesheet)
      await next.fetch(pathname)

      let releaseJavaScript!: () => void
      const javaScriptGate = new Promise<void>((resolve) => {
        releaseJavaScript = resolve
      })
      let edit: Promise<void> | undefined
      let originalDocumentId = ''
      let initialVersion: string | undefined
      let connectionVersion: string | undefined
      let latestConnectionVersion: string | undefined
      let reconnectHmr = () => {}
      const subscriptionVersions: (string | undefined)[] = []
      let initialCss = ''
      let documentRequests = 0
      const browserErrors: string[] = []

      try {
        const browser = await next.browser(pathname, {
          async beforePageLoad(page: Page) {
            await page.addInitScript(() => {
              ;(window as any).__cssRaceDocumentId = crypto.randomUUID()
            })
            page.on('pageerror', (error) => browserErrors.push(error.message))
            page.on('request', (request) => {
              if (
                request.isNavigationRequest() &&
                request.frame() === page.mainFrame()
              ) {
                documentRequests++
              }
            })
            await page.routeWebSocket(/\/_next\/hmr/, (clientSocket) => {
              const serverSocket = clientSocket.connectToServer()
              serverSocket.onMessage((payload) => {
                if (typeof payload === 'string') {
                  const message = JSON.parse(payload)
                  if (message.type === 'turbopack-connected') {
                    connectionVersion ??= message.data.hmrVersion
                    latestConnectionVersion = message.data.hmrVersion
                  }
                }
                clientSocket.send(payload)
              })
              clientSocket.onMessage((payload) => {
                if (typeof payload === 'string') {
                  const message = JSON.parse(payload)
                  if (message.type === 'turbopack-subscribe') {
                    subscriptionVersions.push(message.hmrVersion)
                  }
                }
                serverSocket.send(payload)
              })
              reconnectHmr = () => serverSocket.close()
            })
            await page.route('**/*.js*', async (route) => {
              const response = await route.fetch()
              await javaScriptGate
              await route.fulfill({ response })
            })
            page.on('response', (response) => {
              if (edit || !new URL(response.url()).pathname.endsWith('.css')) {
                return
              }
              edit = (async () => {
                try {
                  await response.finished()
                  initialCss = await response.text()
                  const snapshot = await page.evaluate(() => ({
                    documentId: (window as any).__cssRaceDocumentId,
                    version: (window as any).__nextHmrInitialVersion,
                  }))
                  originalDocumentId = snapshot.documentId
                  initialVersion = snapshot.version
                  await next.patchFile(
                    stylesheet,
                    `${originalCss}\n.race-added { color: ${editedColor}; }\n`
                  )
                } finally {
                  releaseJavaScript()
                }
              })()
            })
          },
        })

        expect(edit).toBeDefined()
        await edit
        expect(initialCss).toContain('.race-target')
        expect(initialCss).not.toContain('.race-added')
        expect(originalDocumentId).not.toBe('')
        expect(initialVersion).toMatch(/^\d+$/)
        expect(Number(connectionVersion)).toBeGreaterThan(
          Number(initialVersion)
        )
        expect(subscriptionVersions[0]).toBe(initialVersion)

        const readColor = () =>
          browser.eval<string>(
            `getComputedStyle(document.querySelector('.race-target')).color`
          )
        const readDocumentId = () =>
          browser.eval<string>('window.__cssRaceDocumentId')

        // Confirm compilation is current before checking the positive behavior.
        await retry(async () => {
          // Recovery may still be navigating when hydration returns for the old
          // document. Read the new document's stylesheet URLs inside the retry.
          const hrefs = await browser.eval<string[]>(
            `Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href'))`
          )
          expect(hrefs?.length).toBeGreaterThan(0)
          const servedCss = (
            await Promise.all(
              hrefs.map(async (href) => (await next.fetch(href)).text())
            )
          ).join('\n')
          expect(servedCss).toContain('.race-added')
        })
        await retry(async () => {
          expect(await readColor()).toBe(editedColor)
          expect(documentRequests).toBe(2)
        })
        expect(await readDocumentId()).not.toBe(originalDocumentId)
        const recoveredDocumentId = await readDocumentId()

        await browser.elementByCss('#counter').click()
        expect(await browser.elementByCss('#counter').text()).toBe('1')
        await next.patchFile(
          stylesheet,
          `${originalCss}\n.race-added { color: ${laterColor}; }\n`
        )
        await retry(async () => {
          expect(await readColor()).toBe(laterColor)
        })
        expect(await browser.elementByCss('#counter').text()).toBe('1')
        expect(await readDocumentId()).toBe(recoveredDocumentId)
        expect(documentRequests).toBe(2)
        // Force a real resubscription after ordinary CSS HMR. The last applied
        // version must match the server, not lag behind an observer-only bump.
        const subscriptionsBeforeReconnect = subscriptionVersions.length
        reconnectHmr()
        await retry(async () => {
          expect(subscriptionVersions.length).toBeGreaterThan(
            subscriptionsBeforeReconnect
          )
          expect(subscriptionVersions[subscriptionVersions.length - 1]).toBe(
            latestConnectionVersion
          )
        }, 10_000)
        expect(await readDocumentId()).toBe(recoveredDocumentId)
        expect(await browser.elementByCss('#counter').text()).toBe('1')
        expect(documentRequests).toBe(2)
        expect(browserErrors).toEqual([])
      } finally {
        releaseJavaScript()
        await next.patchFile(stylesheet, originalCss)
      }
    })
  }

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
