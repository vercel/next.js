import { retry } from 'next-test-utils'
import type { Page } from 'playwright'
import type { NextInstance } from './next-modes/base'

const editedColor = 'rgb(9, 9, 9)'
const laterColor = 'rgb(4, 5, 6)'

// Hold JavaScript until the old CSS body finishes and the local edit completes.
// The helper's watcher delay is safe here: no browser subscription can start yet.
export async function assertCssHmrStartupRecovery(
  next: NextInstance,
  pathname: string,
  stylesheet: string,
  { delayGreetingUntilHydrated = false } = {}
) {
  const originalCss = await next.readFile(stylesheet)
  let releaseJavaScript!: () => void
  const javaScriptGate = new Promise<void>((resolve) => {
    releaseJavaScript = resolve
  })
  let releaseGreeting = () => {}
  const bufferedGreetingFrames: (string | Buffer)[] = []
  let firstSocket = true
  let socketOpened = false
  let firstGreetingReceived = false
  let edit: Promise<void> | undefined
  let originalDocumentId = ''
  let initialVersion: string | undefined
  let connectionVersion: string | undefined
  let latestConnectionVersion: string | undefined
  let reconnectHmr = () => {}
  let closeBrowser = async () => {}
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
        page.on('console', (message) => {
          if (/\[HMR\].*connected/.test(message.text())) socketOpened = true
        })
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
          let bufferDelivery = firstSocket && delayGreetingUntilHydrated
          firstSocket = false
          const deliver = (payload: string | Buffer) => {
            if (typeof payload === 'string') {
              const message = JSON.parse(payload)
              if (message.type === 'turbopack-connected') {
                // Never replace a malformed/missing first version with a later
                // greeting. Recovery/reconnect must not manufacture our proof.
                if (!firstGreetingReceived) {
                  firstGreetingReceived = true
                  connectionVersion = message.data.hmrVersion
                }
                latestConnectionVersion = message.data.hmrVersion
              }
            }
            clientSocket.send(payload)
          }
          serverSocket.onMessage((payload) => {
            if (bufferDelivery) bufferedGreetingFrames.push(payload)
            else deliver(payload)
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
          if (bufferDelivery) {
            releaseGreeting = () => {
              bufferDelivery = false
              for (const payload of bufferedGreetingFrames.splice(0)) {
                deliver(payload)
              }
            }
          }
          reconnectHmr = () => serverSocket.close()
        })
        await page.route('**/*.js*', async (route) => {
          const response = await route.fetch()
          await javaScriptGate
          await route.fulfill({ response })
        })
        page.on('response', (response) => {
          if (edit || !new URL(response.url()).pathname.endsWith('.css')) return
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
    closeBrowser = () => browser.close()

    expect(edit).toBeDefined()
    await edit
    expect(initialCss).toContain('.race-target')
    expect(initialCss).not.toContain('.race-added')
    expect(originalDocumentId).not.toBe('')
    expect(initialVersion).toMatch(/^\d+$/)

    if (delayGreetingUntilHydrated) {
      // A real server greeting exists, but has not been delivered to the page.
      // The onopen diagnostic proves socket readiness independently of greeting
      // receipt. Check React interactivity rather than treating next.browser()
      // returning or the document load event as proof of hydration.
      await retry(async () => {
        expect(
          bufferedGreetingFrames.some(
            (payload) =>
              typeof payload === 'string' &&
              JSON.parse(payload).type === 'turbopack-connected'
          )
        ).toBe(true)
        expect(socketOpened).toBe(true)
      })
      await browser.elementByCss('#counter').click()
      await retry(async () => {
        expect(await browser.elementByCss('#counter').text()).toBe('1')
      })
      expect(firstGreetingReceived).toBe(false)
      expect(connectionVersion).toBeUndefined()
      expect(documentRequests).toBe(1)
      releaseGreeting()
    }

    // Hydration and socket open do not guarantee that the greeting callback has
    // run. Wait for actual first-message evidence, preserving values on timeout.
    await retry(async () => {
      expect({
        initialVersion,
        firstGreeting: connectionVersion,
        firstSubscription: subscriptionVersions[0],
      }).toEqual({
        initialVersion,
        firstGreeting: expect.stringMatching(/^\d+$/),
        firstSubscription: expect.stringMatching(/^\d+$/),
      })
    })
    expect(Number(connectionVersion)).toBeGreaterThan(Number(initialVersion))
    expect(subscriptionVersions[0]).toBe(initialVersion)

    const readColor = () =>
      browser.eval<string>(
        `getComputedStyle(document.querySelector('.race-target')).color`
      )
    const readDocumentId = () =>
      browser.eval<string>('window.__cssRaceDocumentId')

    await retry(async () => {
      // Recovery may still navigate after the old document's hydration. Read
      // the current stylesheet URLs again on every retry.
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

    // Force real resubscription after ordinary HMR: its applied version must
    // match the server, not lag behind an observer-only version increment.
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
    releaseGreeting()
    // Remove this browser's native chunk subscriptions before restoring files
    // or starting another race; only the server's early observer may detect it.
    await closeBrowser()
    await next.patchFile(stylesheet, originalCss)
  }
}
