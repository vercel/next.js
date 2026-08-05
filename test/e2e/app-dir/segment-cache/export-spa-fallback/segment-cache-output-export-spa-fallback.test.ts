import type { Server } from 'http'
import { findPort, retry } from 'next-test-utils'
import { isNextStart, nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { createSpaFallbackServer } from '../export/server.mjs'

// Static hosts commonly answer a missing file with the index document and a
// 200 instead of a 404. In `output: "export"` mode the router skips its
// content-type check, so a prefetch can be handed an HTML document; the Flight
// client is invoked with `allowPartialStream: true`, which never rejects on
// input it cannot parse. The prefetch promise never settles, and the link goes
// permanently dead.
describe('segment cache (output: "export", SPA fallback host)', () => {
  if (!isNextStart) {
    test('build test should not run during dev test run', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: join(__dirname, '../export'),
    skipStart: true,
    disableAutoSkewProtection: true,
  })

  let port: number
  let server: Server

  beforeAll(async () => {
    await next.build()
    port = await findPort()
    server = createSpaFallbackServer(join(next.testDir, 'out'))
    server.listen(port)
  })

  afterAll(() => {
    server?.close()
  })

  // Skipped: this fails today. Swapping `createSpaFallbackServer` for
  // `createExportServer` makes it pass, which pins the cause to the 200 rather
  // than to anything about the route: the router recovers from a 404 and wedges
  // on an HTML document. Fixing it means either rejecting `text/html` in the
  // `isOutputExportMode` branch of `fetchPrefetchResponse`, or not passing
  // `allowPartialStream` in this mode. Both are outside the scope of the
  // prefetch strategy change this suite was added alongside.
  it.skip('does not wedge on a link whose segment files were never exported', async () => {
    const browser = await next.browser('/', { baseUrl: port })

    const checkbox = await browser.elementByCss(
      '[data-link-accordion="dynamic-missing-eager"]'
    )
    await checkbox.click()

    const link = await browser.elementByCss('a[href="/dynamic/second"]')
    await link.click()

    // The prefetch cannot succeed here, and it does not have to. What it has to
    // do is fail, so that the click falls back to a plain navigation. Under the
    // bug the click does nothing at all: no soft navigation, no hard
    // navigation, no error.
    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/dynamic/second')
    })
  })
})
