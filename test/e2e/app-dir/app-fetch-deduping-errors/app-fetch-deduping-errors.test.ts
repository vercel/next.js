import { nextTestSetup } from 'e2e-utils'

describe('app-fetch-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should still successfully render when a fetch request that acquires a cache lock errors', async () => {
    const browser = await next.browser('/1')

    expect(await browser.elementByCss('body').text()).toBe('Hello World 1')
  })

  it('should release the cache lock when a fetch URL cannot be parsed', async () => {
    const firstPage = await next.browser('/a')
    expect(await firstPage.elementByCss('body').text()).toBe('fallback')

    const secondPage = await next.browser('/b')
    expect(await secondPage.elementByCss('body').text()).toBe('fallback')
  })
})
