import { nextTestSetup } from 'e2e-utils'

describe('action forward loop prevention', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not loop when a rewrite sends the action POST to a route that does not bundle it', async () => {
    const browser = await next.browser('/with-action')
    await browser.elementById('run-action').click()
    await browser.waitForElementByCss('#action-error')
  })
})
