import { nextTestSetup } from 'e2e-utils'

describe('cache-components-dev-warmup - reused promise', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('aborts dynamic promises when restarting the render', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#random').text()).toMatch(/\d+\.\d+/)
  })
})
