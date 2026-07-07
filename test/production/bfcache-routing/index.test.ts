import { Server } from 'http'
import { nextTestSetup } from 'e2e-utils'
import { findPort, startStaticServer, stopApp } from 'next-test-utils'
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
      // bfcache is not currently supported by CDP, so we need to run this particular test in headed mode
      // https://bugs.chromium.org/p/chromium/issues/detail?id=1317959

      const browser = await next.browser('/index.html', {
        baseUrl: port,
        headless: false,
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
})
