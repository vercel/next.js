import { nextTestSetup } from 'e2e-utils'

describe('Client Navigation accessibility', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const navigateTo = async (browser: any, selector: string) =>
    await browser
      .waitForElementByCss('#' + selector + '-link')
      .click()
      .waitForElementByCss('#' + selector)

  const getAnnouncedTitle = async (browser: any) =>
    await browser.waitForElementByCss('#__next-route-announcer__').text()

  const getDocumentTitle = async (browser: any) =>
    await browser.eval('document.title')

  const getMainHeadingTitle = async (browser: any) =>
    await browser.elementByCss('h1').text()

  describe('<RouteAnnouncer />', () => {
    it('should not have the initial route announced', async () => {
      const browser = await next.browser('/')
      const title = await getAnnouncedTitle(browser)
      expect(title).toBe('')
    })

    it('has aria-live="assertive" and role="alert"', async () => {
      const browser = await next.browser('/')
      const routeAnnouncer = await browser.waitForElementByCss(
        '#__next-route-announcer__'
      )
      const ariaLiveValue = await routeAnnouncer.getAttribute('aria-live')
      const roleValue = await routeAnnouncer.getAttribute('role')

      expect(ariaLiveValue).toBe('assertive')
      expect(roleValue).toBe('alert')
    })

    describe('There is a title but no h1 tag', () => {
      it('has the innerText equal to the value of document.title', async () => {
        const browser = await next.browser('/')
        await navigateTo(browser, 'page-with-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const title = await getDocumentTitle(browser)

        expect(routeAnnouncerValue).toBe(title)
      })
    })

    describe('There is no title but a h1 tag', () => {
      it('has the innerText equal to the value of h1', async () => {
        const browser = await next.browser('/')
        await navigateTo(browser, 'page-with-h1')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const h1Value = await getMainHeadingTitle(browser)

        expect(routeAnnouncerValue).toBe(h1Value)
      })
    })

    describe('There is a title and a h1 tag', () => {
      it('has the innerText equal to the value of h1', async () => {
        const browser = await next.browser('/')
        await navigateTo(browser, 'page-with-h1-and-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const title = await getDocumentTitle(browser)

        expect(routeAnnouncerValue).toBe(title)
      })
    })

    describe('There is no title and no h1 tag', () => {
      it('has the innerText equal to the value of the pathname', async () => {
        const browser = await next.browser('/')
        await navigateTo(browser, 'page-without-h1-or-title')

        const routeAnnouncerValue = await getAnnouncedTitle(browser)
        const pathname = '/page-without-h1-or-title'

        expect(routeAnnouncerValue).toBe(pathname)
      })
    })
  })
})
