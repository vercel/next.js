import { nextTestSetup } from 'e2e-utils'

describe('not-found-multi-root-layout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render main not-found', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('Main Not Found')
  })

  it('should render sub not-found', async () => {
    const browser = await next.browser('/sub')
    expect(await browser.elementByCss('h1').text()).toBe('Sub Not Found')
  })

  it('should render root not-found for uncaught routes', async () => {
    const browser = await next.browser('/404')
    expect(await browser.elementByCss('h1').text()).toBe('Root Not Found')
  })
})
