import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxHeader } from 'next-test-utils'

describe('withRouter', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  ;(isTurbopack && isNextDev ? describe.skip : describe)(
    'production mode',
    () => {
      it('allows observation of navigation events using withRouter', async () => {
        const browser = await next.browser('/a')
        await browser.waitForElementByCss('#page-a')

        let activePage = await browser.elementByCss('.active').text()
        expect(activePage).toBe('Foo')

        await browser.elementByCss('button').click()
        await browser.waitForElementByCss('#page-b')

        activePage = await browser.elementByCss('.active').text()
        expect(activePage).toBe('Bar')
      })

      it('allows observation of navigation events using top level Router', async () => {
        const browser = await next.browser('/a')
        await browser.waitForElementByCss('#page-a')

        let activePage = await browser
          .elementByCss('.active-top-level-router')
          .text()
        expect(activePage).toBe('Foo')

        await browser.elementByCss('button').click()
        await browser.waitForElementByCss('#page-b')

        activePage = await browser
          .elementByCss('.active-top-level-router')
          .text()
        expect(activePage).toBe('Bar')
      })

      it('allows observation of navigation events using top level Router deprecated behavior', async () => {
        const browser = await next.browser('/a')
        await browser.waitForElementByCss('#page-a')

        let activePage = await browser
          .elementByCss('.active-top-level-router-deprecated-behavior')
          .text()
        expect(activePage).toBe('Foo')

        await browser.elementByCss('button').click()
        await browser.waitForElementByCss('#page-b')

        activePage = await browser
          .elementByCss('.active-top-level-router-deprecated-behavior')
          .text()
        expect(activePage).toBe('Bar')
      })
    }
  )

  if (isNextDev) {
    describe('SSR', () => {
      it('should show an error when trying to use router methods during SSR', async () => {
        const browser = await next.browser('/router-method-ssr')
        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxHeader(browser)).toMatch(
          `No router instance found. you should only use "next/router" inside the client side of your app. https://`
        )
      })
    })
  }
})
