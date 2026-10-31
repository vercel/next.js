import { Server } from 'http'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry, startStaticServer, stopApp } from 'next-test-utils'
import { join } from 'path'

const itHeaded = process.env.HEADLESS ? it.skip : it

describe('bfcache-routing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let port: number
  let app: Server

  beforeAll(async () => {
    const { exitCode } = await next.build()
    // eslint-disable-next-line jest/no-standalone-expect
    expect(exitCode).toBe(0)

    const exportDir = join(next.testDir, 'out')
    port = await findPort()
    app = await startStaticServer(exportDir, undefined, port)
  })

  afterAll(() => {
    stopApp(app)
  })

  itHeaded(
    'should not suspend indefinitely when page is restored from bfcache after an mpa navigation',
    async () => {
      // bfcache is not currently supported by CDP, so this test only runs in
      // headed mode (`itHeaded` skips it when the HEADLESS env var is set)
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1317959

      const browser = await next.browser('/index.html', {
        baseUrl: port,
      })

      // we overwrite the typical waitUntil: 'load' option here as the event is never being triggered if we hit the bfcache
      const bfOptions = { waitUntil: 'commit' as const }

      await browser.elementByCss('a[href="https://example.vercel.sh"]').click()
      await browser.waitForCondition(
        'window.location.origin === "https://example.vercel.sh"'
      )

      await browser.back(bfOptions)

      await browser.waitForCondition(
        'window.location.origin.includes("localhost")'
      )

      let html = await browser.eval<string>(
        'document.documentElement.innerHTML'
      )

      expect(html).toContain('BFCache Test')

      await browser.eval(`document.querySelector('button').click()`)

      html = await browser.eval<string>('document.documentElement.innerHTML')
      expect(html).toContain('BFCache Test')

      await browser.forward(bfOptions)
      await browser.back(bfOptions)

      await browser.waitForCondition(
        'window.location.origin.includes("localhost")'
      )

      html = await browser.eval<string>('document.documentElement.innerHTML')
      expect(html).toContain('BFCache Test')

      await browser.eval(
        `document.querySelector('a[href="https://example.vercel.sh"]').click()`
      )
      await browser.waitForCondition(
        'window.location.origin === "https://example.vercel.sh"'
      )
    }
  )

  it('should not repeat an MPA navigation when the page is restored from bfcache', async () => {
    let externalRequests = 0
    const browser = await next.browser('/index.html', {
      baseUrl: port,
      async beforePageLoad(page) {
        // A 204 response cancels the navigation, so the page stays where it
        // is while the router is still waiting for the MPA navigation.
        await page.route('https://example.vercel.sh/**', (route) => {
          externalRequests++
          return route.fulfill({ status: 204 })
        })
      },
    })

    await browser.elementByCss('#push-external').click()
    await retry(async () => {
      expect(externalRequests).toBe(1)
    })

    // Headless browsers don't use the bfcache, so simulate the event that's
    // fired when a page is restored from it.
    await browser.eval(
      `window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))`
    )

    // A Transition anywhere in the app also renders the router's pending
    // updates. If the router still rendered the MPA navigation, it would
    // suspend and fire the navigation again.
    await browser.elementByCss('#transition').click()
    await retry(async () => {
      expect(await browser.elementByCss('#counter').text()).toBe('1')
    })
    expect(externalRequests).toBe(1)

    // A new MPA navigation to the same URL still works after the restore.
    await browser.elementByCss('#push-external').click()
    await retry(async () => {
      expect(externalRequests).toBe(2)
    })
  })
})
