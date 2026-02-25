import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instant-validation-indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('shows validating status for unstable_instant route', async () => {
    await next.fetch('/instant-validation')

    const browser = await next.browser('/')
    await browser.waitForElementByCss('a[href="/instant-validation"]')

    await browser.elementByCss('a[href="/instant-validation"]').click()

    await retry(async () => {
      expect(await browser.url()).toContain('/instant-validation')
    })

    await retry(async () => {
      const badge = await browser.elementByCss('[data-next-badge]')
      const status = await badge.getAttribute('data-status')
      expect(status).toBe('validating')
    })
  })
})
