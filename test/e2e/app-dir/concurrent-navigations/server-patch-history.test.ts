import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server patch - history entry', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    test('skipped in dev mode', () => {})
    return
  }

  // When a navigation suspends and then triggers a server patch (tree
  // mismatch retry), the retry should preserve the original transition's
  // push/replace intent. Because the suspended transition hasn't committed
  // to the browser history yet, the retry inherits its navigate type so
  // that pushState still runs when the entangled transitions eventually
  // commit together.
  it('server patch preserves the push intent of a suspended transition', async () => {
    const browser = await next.browser('/push-search-params')

    await retry(async () => {
      const homePage = await browser.elementById('home-page')
      expect(await homePage.text()).toContain('Home')
    })

    // Navigate to the same page with different search params. The transition
    // suspends while fetching data, and the server response triggers a tree
    // mismatch, causing a server patch retry.
    const pushButton = await browser.elementById('push-button')
    await pushButton.click()

    await retry(async () => {
      expect(await browser.url()).toContain('test=pass')
    })

    // The navigation should have created a new history entry despite the
    // server patch retry, so the back button returns to the original URL.
    await browser.back()

    await retry(async () => {
      const url = await browser.url()
      expect(url).not.toContain('test=pass')
      expect(new URL(url).pathname).toBe('/push-search-params')
    })
  })
})
