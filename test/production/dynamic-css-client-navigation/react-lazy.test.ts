import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe.each(['edge', 'nodejs'])(
  'dynamic-css-client-navigation react lazy %s',
  (runtime) => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it(`should not remove style when navigating from static imported component to react lazy at runtime ${runtime}`, async () => {
      const browser = await next.browser(`/${runtime}`)

      await browser.elementByCss(`a[href="/${runtime}/react-lazy"]`).click()

      await retry(async () => {
        expect(await browser.waitForElementByCss('#red-button').text()).toBe(
          'Red Button'
        )

        const buttonBgColor = await browser
          .elementByCss('button')
          .getComputedCss('background-color')

        expect(buttonBgColor).toBe('rgb(255, 0, 0)')
      })
    })
  }
)
