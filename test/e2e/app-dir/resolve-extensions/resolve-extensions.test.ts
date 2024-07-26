import { nextTestSetup } from 'e2e-utils'

describe('turbo-resolve-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should SSR', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
    expect(html).toContain('hello server')
    expect(html).toContain('hello image 1')
    expect(html).toContain('hello image 2')
  })

  it('should work using browser', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('body').text()
    expect(text).toContain('hello world')
    expect(text).toContain('hello client')
  })
})
