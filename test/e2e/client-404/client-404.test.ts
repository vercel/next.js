import { nextTestSetup, isNextStart } from 'e2e-utils'
import {
  retry,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

describe('Client 404', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('should show 404 upon client replacestate', () => {
    it('should navigate the page', async () => {
      const browser = await next.browser('/asd')
      const serverCode = await browser
        .waitForElementByCss('#errorStatusCode')
        .text()
      await browser.waitForElementByCss('#errorGoHome').click()
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
