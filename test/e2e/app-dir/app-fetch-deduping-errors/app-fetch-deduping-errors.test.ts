import { nextTestSetup } from 'e2e-utils'

describe('app-fetch-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should still successfully render when a fetch request that acquires a cache lock errors', async () => {
    const browser = await next.browser('/1')

    expect(await browser.elementByCss('body').text()).toBe('Hello World 1')
  })
})
