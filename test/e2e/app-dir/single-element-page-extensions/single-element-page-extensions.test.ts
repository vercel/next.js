import { nextTestSetup } from 'e2e-utils'

describe('single-element-page-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
