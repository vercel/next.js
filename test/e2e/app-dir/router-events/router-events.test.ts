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
          .elementById('to-navigation-link')
          .click()
          .waitForElementByCss('#to-page')

        await browser
          .elementById('user-navigation-link')
          .click()
          .waitForElementByCss('#user-page')

        const navigations = await browser.eval(`window.navigations`)
        expect(navigations).toStrictEqual([
          expect.stringMatching(/http:\/\/localhost:[0-9]+\/to/),
          expect.stringMatching(/http:\/\/localhost:[0-9]+\/to\/4/),
        ])
      })
    })
  }
)
