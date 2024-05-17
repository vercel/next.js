import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app-prefetch-false-loading', () => {
  const { next } = nextTestSetup({
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

    await retry(async () => {
      expect(
        await browser.hasElementByCssSelector('#nested-testing-page')
      ).toMatch(true)
    })

    const newRandomNumber = await browser.elementById('random-number').text()

    expect(initialRandomNumber).toBe(newRandomNumber)

    await retry(() => {
      const logOccurrences =
        next.cliOutput.slice(logStartIndex).split('re-fetching in layout')
          .length - 1

      expect(logOccurrences).toBe(1)
    })
  })
})
