import { nextTestSetup, type Playwright } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app a11y features', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    packageJson: {},
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  describe('route announcer', () => {
    async function getAnnouncerContent(browser: Playwright) {
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

    it('should announce h1 changes when the document title is unchanged', async () => {
      const browser = await next.browser('/shared-title/page-a')
      await browser.elementById('shared-title-page-b').click()
      await check(() => getAnnouncerContent(browser), 'shared-title/page-b')
    })

    it('should announce the pathname when neither the title nor the h1 changed', async () => {
      const browser = await next.browser('/shared-title/no-h1-1')
      await browser.elementById('shared-title-no-h1-2').click()
      await check(() => getAnnouncerContent(browser), '/shared-title/no-h1-2')
    })
  })
})
