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
      expect(next.cliOutput.slice(cliOutputLength)).not.toInclude(
        'RootLayout rendered, locale: en'
      )
    }
  })
})
