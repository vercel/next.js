import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-route-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should behave correctly without any errors', async () => {
    const browser = await next.browser('/en')
    await retry(() => {
      expect(
        next.cliOutput.includes('TypeError') ||
          next.cliOutput.includes('Warning')
      ).toBeTruthy()
    })

    expect(await browser.elementByCss('body').text()).not.toContain(
      'Interception Modal'
    )
    expect(await browser.elementByCss('body').text()).toContain('Locale: en')

    await browser.elementByCss("[href='/en/show']").click()

    await retry(() => {
      expect(
        next.cliOutput.includes('TypeError') ||
          next.cliOutput.includes('Warning')
      ).toBeTruthy()
    })

    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(
        /Interception Modal/
      )
    })
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Locale: en/)
    })

    await browser.refresh()
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(
        /Regular Modal Page/
      )
    })
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Locale: en/)
    })
  })

  it('should handle the not found case correctly without any errors', async () => {
    const browser = await next.browser('/de/show')
    await retry(() => {
      expect(
        next.cliOutput.includes('TypeError') ||
          next.cliOutput.includes('Warning')
      ).toBeTruthy()
    })

    expect(await browser.elementByCss('body').text()).toContain(
      'Custom Not Found'
    )
  })
})
