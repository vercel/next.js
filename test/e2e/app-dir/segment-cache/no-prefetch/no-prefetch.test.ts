import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('navigating without a prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('can show a loading boundary from the dynamic response', async () => {
    const browser = await next.browser('/')

    // Navigate to a dynamic page with a `loading.tsx` without a prefetch.
    await browser.elementByCss('a[href="/with-loading"]').click()

    // The page suspends on the client, so we should display the `loading` that we got from the dynamic response.
    await retry(async () => {
      expect(
        await browser
          .elementByCss('#loading-component', { state: 'visible' })
          .text()
      ).toContain('Loading...')
    })
  })
})
