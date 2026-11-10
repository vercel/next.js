import { nextTestSetup } from 'e2e-utils'

describe('proxy-runtime-nodejs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should use nodejs runtime for proxy by default', async () => {
    const browser = await next.browser('/foo')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
