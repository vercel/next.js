import { nextTestSetup } from 'e2e-utils'

describe('compiler.define', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the magic variable on server side', async () => {
    const res = await next.fetch('/')
    const html = (await res.text()).replaceAll(/<!-- -->/g, '')
    expect(html).toContain('Server value: foobar')
    expect(html).toContain('Client value: foobar')
  })

  it('should render the magic variable on client side', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('body').text()
    expect(text).toContain('Server value: foobar')
    expect(text).toContain('Client value: foobar')
  })
})
