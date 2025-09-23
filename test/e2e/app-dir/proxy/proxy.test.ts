import { nextTestSetup } from 'e2e-utils'

describe('proxy', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with proxy file as middleware', async () => {
    const browser = await next.browser('/foo')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
