import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import { BrowserInterface } from 'test/lib/browsers/base'

createNextDescribe(
  'optimistic-navigation',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that need a full browser
    it.each(['link', 'push', 'replace'])(
      'it should do optimistic update when navigating using %s',
      async (type) => {
        const browser: BrowserInterface = await next.browser('/')

        // We don't want to await here because clicking will take forever
        browser.elementById(`${type}-long-load`).click()

        await waitFor(1000)
        expect(await browser.url()).toEndWith('/long-load')
      }
    )
  }
)
