import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'

const stylesheet = 'app/globals.css'
const editedColor = 'rgb(9, 9, 9)'
const laterColor = 'rgb(4, 5, 6)'

// Regression coverage for https://github.com/vercel/next.js/pull/99893.
// Hold JavaScript so the old CSS body finishes before the edit and before any
// browser HMR subscription can start. The patch helper's usual watcher delay
// is safe here because JavaScript remains blocked until the patch completes.
// This race requires a local stylesheet edit and a development HMR stream.
// @force-gate dev && turbopack
describe('css-hmr-initial-load-race', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('reconciles CSS edited before HMR subscribes without reloading the document', async () => {
    const originalCss = await next.readFile(stylesheet)
    await next.fetch('/')

    let releaseJavaScript!: () => void
    const javaScriptGate = new Promise<void>((resolve) => {
      releaseJavaScript = resolve
    })
    let edit: Promise<void> | undefined
    let originalDocumentId = ''
    let initialCss = ''
    let documentRequests = 0
    const browserErrors: string[] = []

    try {
      const browser = await next.browser('/', {
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
                originalDocumentId = await page.evaluate(
                  () => (window as any).__cssRaceDocumentId
                )
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

      const readColor = () =>
        browser.eval<string>(
          `getComputedStyle(document.querySelector('.race-target')).color`
        )
      const readDocumentId = () =>
        browser.eval<string>('window.__cssRaceDocumentId')

      // Confirm compilation is current before checking the positive behavior.
      const hrefs = await browser.eval<string[]>(
        `Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href'))`
      )
      expect(hrefs.length).toBeGreaterThan(0)
      await retry(async () => {
        const servedCss = (
          await Promise.all(
            hrefs.map(async (href) => (await next.fetch(href)).text())
          )
        ).join('\n')
        expect(servedCss).toContain('.race-added')
      })
      await retry(async () => {
        expect(await readColor()).toBe(editedColor)
      })
      expect(await readDocumentId()).toBe(originalDocumentId)
      expect(documentRequests).toBe(1)

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
      expect(await readDocumentId()).toBe(originalDocumentId)
      expect(documentRequests).toBe(1)
      expect(browserErrors).toEqual([])
    } finally {
      releaseJavaScript()
      await next.patchFile(stylesheet, originalCss)
    }
  })

  it('keeps a later edit newer than an in-flight initial CSS reconciliation', async () => {
    const originalCss = await next.readFile(stylesheet)
    await next.fetch('/')
    let releaseCss!: () => void
    const cssGate = new Promise<void>((resolve) => {
      releaseCss = resolve
    })
    let cssRequests = 0
    let heldCss: string | undefined
    let laterInstruction = false
    const errors: string[] = []

    try {
      const browser = await next.browser('/', {
        // A replacement stylesheet intentionally stays in flight; don't wait
        // for the document's load event, which it can hold up.
        waitUntil: 'domcontentloaded',
        async beforePageLoad(page) {
          await page.addInitScript(() => {
            ;(window as any).__cssRaceDocumentId = crypto.randomUUID()
          })
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('websocket', (socket) => {
            socket.on('framereceived', ({ payload }) => {
              if (typeof payload !== 'string') return
              const message = JSON.parse(payload)
              if (message.type !== 'turbopack-message') return
              const updates = Array.isArray(message.data)
                ? message.data
                : [message.data]
              if (
                updates.some((update) =>
                  Object.entries(update.instruction?.chunks ?? {}).some(
                    ([path, change]: [string, any]) =>
                      path.endsWith('.css') && change.type === 'total'
                  )
                )
              ) {
                laterInstruction = true
              }
            })
          })
          await page.route('**/*.css*', async (route) => {
            const response = await route.fetch()
            cssRequests++
            if (cssRequests === 2) {
              // Snapshot the older body before the later edit. Control when it
              // reaches the browser, rather than relying on network latency.
              heldCss = await response.text()
              await cssGate
              await route.fulfill({ response, body: heldCss })
            } else {
              await route.fulfill({ response })
            }
          })
        },
      })
      await retry(async () => {
        expect(heldCss).toBeDefined()
      })
      expect(heldCss).not.toContain('.race-added')
      const documentId = await browser.eval<string>(
        'window.__cssRaceDocumentId'
      )
      await browser.elementByCss('#counter').click()
      await next.patchFile(
        stylesheet,
        `${originalCss}\n.race-added { color: ${laterColor}; }\n`
      )
      await retry(async () => {
        expect(laterInstruction).toBe(true)
      })
      // The newer HMR instruction has arrived while the older body is held.
      // The loader must serialize it, not issue a competing CSS replacement.
      expect(cssRequests).toBe(2)
      releaseCss()
      await retry(async () => {
        expect(
          await browser.eval<string>(
            `getComputedStyle(document.querySelector('.race-target')).color`
          )
        ).toBe(laterColor)
        // Initial load plus two serialized refreshes, each loading a temporary
        // sheet then adopting its URL into the renderer-owned original node.
        expect(cssRequests).toBe(5)
        expect(
          await browser.eval<number>(
            `document.querySelectorAll('link[rel="stylesheet"]').length`
          )
        ).toBe(1)
      })
      expect(await browser.elementByCss('#counter').text()).toBe('1')
      expect(await browser.eval('window.__cssRaceDocumentId')).toBe(documentId)
      expect(errors).toEqual([])
    } finally {
      releaseCss()
      await next.patchFile(stylesheet, originalCss)
    }
  })
})
