import { Server } from 'http'
import {
  findPort,
  nextBuild,
  startStaticServer,
  stopApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('export-routing', () => {
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

    await browser.elementByCss('a[href="https://example.vercel.sh"]').click()
    await browser.waitForCondition(
      'window.location.origin === "https://example.vercel.sh"'
    )

    // this will never resolve in the failure case, as the page will be suspended indefinitely
    await browser.back()

    expect(await browser.elementByCss('#counter').text()).toBe('0')

    // click the button
    await browser.elementByCss('button').click()

    // counter should be 1
    expect(await browser.elementByCss('#counter').text()).toBe('1')
  })
})
