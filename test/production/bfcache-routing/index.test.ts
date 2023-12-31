import { Server } from 'http'
import {
  findPort,
  nextBuild,
  startStaticServer,
  stopApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('bfcache-routing', () => {
  let port: number
  let app: Server

  beforeAll(async () => {
    const appDir = __dirname
    const exportDir = join(appDir, 'out')

    await nextBuild(appDir, undefined, { cwd: appDir })
    port = await findPort()
    app = await startStaticServer(exportDir, undefined, port)
  })

  afterAll(() => {
    stopApp(app)
  })

  it('should not suspend indefinitely when page is restored from bfcache after an mpa navigation', async () => {
    // bfcache is not currently supported by CDP, so we need to run this particular test in headed mode
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1317959
    if (!process.env.CI && process.env.HEADLESS) {
      console.warn('This test can only run in headed mode. Skipping...')
      return
    }

    const browser = await webdriver(port, '/index.html', { headless: false })

    // we overwrite the typical waitUntil: 'load' option here as the event is never being triggered if we hit the bfcache
    const bfOptions = { waitUntil: 'commit' }

    await browser.elementByCss('a[href="https://example.vercel.sh"]').click()
    await browser.waitForCondition(
      'window.location.origin === "https://example.vercel.sh"'
    )

    await browser.back(bfOptions)

    await browser.waitForCondition(
      'window.location.origin.includes("localhost")'
    )

    let html = await browser.evalAsync('document.documentElement.innerHTML')

    expect(html).toContain('BFCache Test')

    await browser.evalAsync(`document.querySelector('button').click()`)

    // we should still be on the test page
    html = await browser.evalAsync('document.documentElement.innerHTML')
    expect(html).toContain('BFCache Test')

    await browser.forward(bfOptions)
    await browser.back(bfOptions)

    await browser.waitForCondition(
      'window.location.origin.includes("localhost")'
    )

    // we should be back on the test page with no errors
    html = await browser.evalAsync('document.documentElement.innerHTML')
    expect(html).toContain('BFCache Test')
  })
})
