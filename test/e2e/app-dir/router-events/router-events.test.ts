import webdriver from 'next-webdriver'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'router emitting navigation events',
  {
    files: __dirname,
  },
  ({ next }) => {
    describe('routeChangeStart', () => {
      it('should fire when Link is clicked', async () => {
        const browser = await webdriver(next.url, '/from')

        await browser
          .elementByCss('#navigation-link')
          .click()
          .waitForElementByCss('#to-page')

        const navigations = await browser.eval(`window.navigations`)
        expect(navigations).toBe(1000)
      })
    })
  }
)
