import { nextTestSetup } from 'e2e-utils'

describe('ppr-history-replace-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not remount component', async () => {
    const browser = await next.browser('/')
    await await browser.elementByCss('input').type('a')
    // When the input is remounted, its value is cleared.
    expect(await browser.elementByCss('input').getValue()).toBe('a')
  })
})
