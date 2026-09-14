import { nextTestSetup, isNextStart } from 'e2e-utils'
import {
  retry,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

describe('Client 404', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Assertions don't apply to deploy mode (output differs vs. local Next.js server).
    skipDeployment: true,
  })
  if (skipped) return

  beforeAll(async () => {
    // pre-build the home page so that navigating to it from the
    // error page doesn't time out while webpack compiles on demand
    await next.render('/')
  })

  describe('should show 404 upon client replacestate', () => {
    it('should navigate the page', async () => {
      const browser = await next.browser('/asd')
      const serverCode = await browser
        .waitForElementByCss('#errorStatusCode')
        .text()
      // In webpack dev mode, compiling the home page (via the
      // `next.render('/')` pre-build in beforeAll) can race with the
      // `/asd` page's hydration and trigger a Fast Refresh-driven full
      // reload, which in turn swallows the click on `#errorGoHome` and
      // leaves the browser back on `/asd`. Retry the click until the
      // home page actually becomes visible.
      await retry(async () => {
        if (!(await browser.hasElementByCssSelector('#hellom8'))) {
          await browser.waitForElementByCss('#errorGoHome').click()
          await browser.waitForElementByCss('#hellom8', 5000)
        }
      })
      await browser.waitForElementByCss('#hellom8').back()
      const clientCode = await browser
        .waitForElementByCss('#errorStatusCode')
        .text()

      expect({ serverCode, clientCode }).toMatchObject({
        serverCode: '404',
        clientCode: '404',
      })
      await browser.close()
    })
  })

  it('should hard navigate to URL on failing to load bundle', async () => {
    const browser = await next.browser('/invalid-link')
    await browser.eval(() => ((window as any).beforeNav = 'hi'))
    await browser.elementByCss('#to-nonexistent').click()
    await retry(async () => {
      expect(await browser.elementByCss('#errorStatusCode').text()).toMatch(
        /404/
      )
    })
    expect(await browser.eval(() => (window as any).beforeNav)).not.toBe('hi')
  })

  if (isNextStart) {
    it('should hard navigate to URL on failing to load missing bundle', async () => {
      const chunk = getClientBuildManifestLoaderChunkUrlPath(
        next.testDir,
        '/missing'
      )
      const browser = await next.browser('/to-missing-link', {
        beforePageLoad(page) {
          page.route(`**/${chunk}*`, (route) => {
            route.abort('internetdisconnected')
          })
        },
      })
      await browser.eval(() => ((window as any).beforeNav = 'hi'))
      await browser.elementByCss('#to-missing').click()

      await retry(async () => {
        expect(await browser.url()).toContain('/missing')
      })
      expect(await browser.elementByCss('#missing').text()).toBe('poof')
      expect(await browser.eval(() => (window as any).beforeNav)).not.toBe('hi')
    })
  }
})
