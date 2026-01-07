import { nextTestSetup } from 'e2e-utils'

describe('root-layout-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work using browser', async () => {
    const browser = await next.browser('/')

    expect(
      await browser
        .elementByCss('#trigger-redirect')
        .click()
        .waitForElementByCss('#result')
        .text()
    ).toBe('Result Page')

    const browserLogs = await browser.log()

    let foundErrors = false

    browserLogs.forEach((log) => {
      if (log.source === 'error') {
        foundErrors = true
      }
    })

    expect(foundErrors).toBe(false)
  })
})
