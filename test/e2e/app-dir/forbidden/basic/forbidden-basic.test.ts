import { nextTestSetup } from 'e2e-utils'

describe('app dir - forbidden with customized boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match dynamic route forbidden boundary correctly', async () => {
    // `/dynamic` display works
    const browser = await next.browser('/dynamic')
    expect(await browser.elementByCss('main').text()).toBe('dynamic')

    // `/dynamic/403` calling forbidden() will match the same level forbidden boundary
    await browser.get('/dynamic/403')
    expect(await browser.elementByCss('#forbidden').text()).toBe(
      'dynamic/[id] forbidden'
    )

    await browser.get('/dynamic/123')
    expect(await browser.elementByCss('#page').text()).toBe('dynamic [id]')
  })

  it('should escalate forbidden to parent layout if no forbidden boundary present in current layer', async () => {
    const browser = await next.browser('/dynamic-layout-without-forbidden')
    expect(await browser.elementByCss('h1').text()).toBe('Dynamic with Layout')

    // no forbidden boundary in /dynamic-layout-without-forbidden, escalate to parent layout to render root forbidden
    await browser.get('/dynamic-layout-without-forbidden/403')
    expect(await browser.elementByCss('h1').text()).toBe('Root Forbidden')
  })
})
