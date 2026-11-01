import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('cache-components-dev-warmup - reused promise', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('aborts dynamic promises when restarting the render', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#random').text()).toMatch(/\d+\.\d+/)
  })
})
