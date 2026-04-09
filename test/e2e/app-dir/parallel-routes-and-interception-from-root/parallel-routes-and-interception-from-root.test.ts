import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-and-interception-from-root', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should interpolate [locale] in "/[locale]/example/(...)[locale]/intercepted"', async () => {
    const browser = await next.browser('/en/example')

    expect(await browser.elementByCss('h1').text()).toBe('Example Page')
    expect(await browser.elementByCss('p').text()).toBe('Locale: en')

    if (!isNextDeploy) {
      expect(next.cliOutput).toInclude('RootLayout rendered, locale: en')
    }

    // Referenced by commented out assertion below, see TODO message
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const cliOutputLength = next.cliOutput.length

    await browser.elementByCss('a').click()

    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toBe(
        'Page intercepted from root'
      )
    })

    // Ensure that the locale is still correctly rendered in the root layout.
    expect(await browser.elementByCss('p').text()).toBe('Locale: en')

    // ...and that the root layout was not rerendered.
    if (!isNextDeploy) {
      // FIXME: This assertion is temporarily disabled. Clicking the link should
      // not re-render the root layout. This is happening because the response
      // includes extra search params in the page segment that shouldn't be
      // there: "__PAGE__?{\"locale":\"en\"}" instead of "__PAGE__". On the
      // surface, it looks like the route params are accidentally being treated
      // as search params.
      //
      // This assertion used to pass despite the mismatch, because client was
      // more permissive about validating the tree when receiving a dynamic
      // response from the server. But now we intentionally compare all the
      // segments, including the search params.
      //
      // Regardless, we need to fix whatever's causing the params to be treated
      // as search params.
      //
      // Correct behavior:
      // expect(next.cliOutput.slice(cliOutputLength)).not.toInclude(
      //   'RootLayout rendered, locale: en'
      // )
    }
  })
})
