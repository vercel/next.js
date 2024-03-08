import { nextTestSetup } from 'e2e-utils'

describe('multi-root-layout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render main root layout not-found', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('h1').text()).toBe('Main Root Not Found')
  })

  it('should render main root layout inside not-found', async () => {
    const browser = await next.browser('/main-dynamic/404')
    expect(await browser.elementByCss('h1').text()).toBe('Main Root Not Found')
  })

  it('should render sub root layout not-found', async () => {
    const browser = await next.browser('/sub-catch-all/404/404')
    expect(await browser.elementByCss('h1').text()).toBe('Sub Root Not Found')
  })
})
