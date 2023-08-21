import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import type { BrowserInterface } from 'test/lib/browsers/base'

createNextDescribe(
  'app a11y features',
  {
    files: __dirname,
    packageJson: {},
    skipDeployment: true,
  },
  ({ next }) => {
    describe('route announcer', () => {
      async function getAnnouncerContent(browser: BrowserInterface) {
        return browser.eval(
          `document.getElementsByTagName('next-route-announcer')[0]?.shadowRoot.childNodes[0]?.innerHTML`
        )
      }

      it('should not announce the initital title', async () => {
        const browser = await next.browser('/page-with-h1')
        await check(() => getAnnouncerContent(browser), '')
      })

      it('should announce document.title changes', async () => {
        const browser = await next.browser('/page-with-h1')
        await browser.elementById('page-with-title').click()
        await check(() => getAnnouncerContent(browser), 'page-with-title')
      })

      it('should announce h1 changes', async () => {
        const browser = await next.browser('/page-with-h1')
        await browser.elementById('noop-layout-page-1').click()
        await check(() => getAnnouncerContent(browser), 'noop-layout/page-1')
      })

      it('should announce route changes when h1 changes inside an inner layout', async () => {
        const browser = await next.browser('/noop-layout/page-1')
        await browser.elementById('noop-layout-page-2').click()
        await check(() => getAnnouncerContent(browser), 'noop-layout/page-2')
      })
    })
  }
)
