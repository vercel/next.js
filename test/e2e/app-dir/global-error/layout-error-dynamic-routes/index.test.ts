import { getRedboxHeader, hasRedbox } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

async function testDev(browser, errorRegex) {
  expect(await hasRedbox(browser)).toBe(true)
  expect(await getRedboxHeader(browser)).toMatch(errorRegex)
}

describe('app dir - global error - layout error', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render global error for error in server components inside dynamic route [lang]', async () => {
    const browser = await next.browser('/en')

    if (isNextDev) {
      await testDev(browser, /Global error: layout error/)
    } else {
      expect(await browser.elementByCss('h1').text()).toBe('Global Error')
      expect(await browser.elementByCss('#error').text()).toBe(
        'Global error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(await browser.elementByCss('#digest').text()).toMatch(/\w+/)
    }
  })
})
