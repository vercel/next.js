import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('repeated-search-params-cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression for #92152: when a search param key is used multiple times
  // (e.g. ?color=red&color=green&color=blue), the client router cache key
  // collapsed values to the *last* one only via
  // `Object.fromEntries(new URLSearchParams(...))`. Removing a non-last value
  // produced a URL whose collapsed key matched the previous entry, causing
  // the cache to return stale rendered output.
  it('invalidates the page cache when removing a non-last repeated search param', async () => {
    const browser = await next.browser('/')

    // Start with all three colors selected: ?color=red&color=green&color=blue
    await browser.elementByCss('#link-all').click()
    await retry(async () => {
      const items: string[] = await browser.eval(() =>
        Array.from(document.querySelectorAll('#result li')).map(
          (li) => (li as HTMLElement).textContent || ''
        )
      )
      expect(items).toEqual(['red', 'green', 'blue'])
    })

    // Navigate to ?color=red&color=blue (green removed). Under the bug,
    // the collapsed cache key {"color":"blue"} matched the previous entry
    // and the result list stayed ["red", "green", "blue"].
    await browser.elementByCss('#link-rb').click()
    await retry(async () => {
      const items: string[] = await browser.eval(() =>
        Array.from(document.querySelectorAll('#result li')).map(
          (li) => (li as HTMLElement).textContent || ''
        )
      )
      expect(items).toEqual(['red', 'blue'])
    })
  })
})
