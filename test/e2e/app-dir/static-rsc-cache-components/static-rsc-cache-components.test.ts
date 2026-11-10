import { nextTestSetup } from 'e2e-utils'

describe('static-rsc-cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    it('is skipped', () => {})
    return
  }

  it('navigates to prerendered route without waiting for dynamic render', async () => {
    const browser = await next.browser('/')

    // Track elapsed time across the client navigation.
    await browser.eval(`window.__navStart = performance.now()`)

    const link = await browser.elementByCss('a[href="/alpha"]')
    await link.click()

    const slug = await browser.elementById('slug')
    expect(await slug.innerText()).toBe('Hi alpha')

    const elapsed = await browser.eval(`performance.now() - window.__navStart`)

    // The page has an intentional 2s delay in the Server Component.
    // If this were a dynamic render, navigation would take ~2s+.
    expect(elapsed).toBeLessThan(1500)
  })
})
