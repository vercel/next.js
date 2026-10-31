import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('router-outcome-while-sibling-blocks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // The page redirects while a sibling in its layout blocks on slow
  // request-time data with no Suspense boundary above it. The render already
  // knows the outcome, so the redirect must not wait for that unrelated data.
  it('redirects without waiting for blocking sibling data', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/blocking/redirect"]').click()

    await retry(
      async () => {
        expect(await browser.url()).toBe(`${next.url}/destination`)
        expect(await browser.elementById('destination').text()).toBe(
          'Destination'
        )
      },
      5_000,
      250,
      'redirect to /destination'
    )
  })
})
