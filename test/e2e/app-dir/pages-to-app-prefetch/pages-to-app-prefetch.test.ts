import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Pages Router prefetch of an App Router route', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  // The Pages Router does not prefetch in development.
  ;(isNextDev ? describe.skip : describe)('production mode', () => {
    it('does not fetch Pages data for an App route shadowed by a Pages catch-all', async () => {
      const browser = await next.browser('/about')
      const dataRequests: string[] = []
      browser.on('request', (request) => {
        if (
          /\/_next\/data\/.*\/dashboard\.json$/.test(
            new URL(request.url()).pathname
          )
        ) {
          dataRequests.push(request.url())
        }
      })

      await browser.elementById('show-link').click()
      // The filter marks the App route during prefetch. Neither the viewport
      // prefetch nor the hover should request data from the Pages catch-all.
      await retry(async () => {
        expect(
          await browser.eval(
            "window.next.router.components['/dashboard']?.__appRouter"
          )
        ).toBe(true)
      })
      await browser.elementById('app-link').moveTo()
      await browser.waitForIdleNetwork()
      expect(dataRequests).toEqual([])

      await browser.elementById('app-link').click()
      await browser.waitForElementByCss('#app-page')
      expect(await browser.elementById('app-page').text()).toBe('Dashboard')
    })
  })
})
