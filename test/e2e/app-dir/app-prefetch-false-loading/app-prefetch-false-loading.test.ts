import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('app-prefetch-false-loading', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  it('should render loading for the initial render', async () => {
    const $ = await next.render$('/en/testing')

    expect($('#loading').text()).toBe('Loading...')
  })
  it('should not re-trigger loading state when navigating between pages that share a dynamic layout', async () => {
    const logStartIndex = next.cliOutput.length

    const browser = await next.browser('/en/testing')
    let initialRandomNumber = await browser.elementById('random-number').text()
    await browser.elementByCss('[href="/en/testing/test"]').click()
    expect(await browser.hasElementByCssSelector('#loading')).toBeFalsy()

    await check(
      () => browser.hasElementByCssSelector('#nested-testing-page'),
      true
    )

    const newRandomNumber = await browser.elementById('random-number').text()

    expect(initialRandomNumber).toBe(newRandomNumber)

    // Deploy doesn't have access to runtime logs. This assertion is also redundant since if
    // the layout was re-fetched, the `no-store` on the random number would have resulted in a new value.
    // Keeping this here for consistency with the original test.
    if (!isNextDeploy) {
      await check(() => {
        const logOccurrences =
          next.cliOutput.slice(logStartIndex).split('re-fetching in layout')
            .length - 1

        return logOccurrences
      }, 1)
    }
  })
})
