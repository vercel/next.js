import { nextTestSetup } from 'e2e-utils'

describe('app dir - navigation with Suspense in nested layout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('resolves data after client navigation to a nested layout with Suspense', async () => {
    const browser = await next.browser('/nested')

    await browser.waitForElementByCss('[data-testid="nested-resolved"]')

    await browser.waitForElementByCss('a[href="/"]').click()

    await browser.waitForElementByCss('a[href="/nested"]').click()

    await browser.waitForElementByCss('[data-testid="nested-resolved"]')
  })
})
