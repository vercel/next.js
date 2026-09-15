import { isNextDev, nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): No deploy-specific incompatibility is
// documented.
// @force-gate !deploy
// @force-gate turbopack
describe('import.meta.env', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('exposes built-in environment values on the server and client', async () => {
    const browser = await next.browser('/docs')
    const expectedMode = isNextDev ? 'development' : 'production'

    expect(
      JSON.parse(await browser.elementByCss('#server-env dd').text())
    ).toEqual({
      DEV: isNextDev,
      PROD: !isNextDev,
      MODE: expectedMode,
      BASE_URL: '/docs/',
      SSR: true,
    })
    expect(
      JSON.parse(await browser.elementByCss('#client-env dd').text())
    ).toEqual({
      DEV: isNextDev,
      PROD: !isNextDev,
      MODE: expectedMode,
      BASE_URL: '/docs/',
      SSR: false,
    })
  })

  it('supports static bracket access and unknown properties', async () => {
    const browser = await next.browser('/docs')
    const $ = await next.render$('/docs')
    const expectedMode = isNextDev ? 'development' : 'production'

    expect($('#server-env dd').eq(1).text()).toBe(expectedMode)
    expect($('#server-env dd').eq(2).text()).toBe('undefined')
    expect(
      await browser.elementByCss('#client-env dd:nth-of-type(2)').text()
    ).toBe(expectedMode)
    expect(
      await browser.elementByCss('#client-env dd:nth-of-type(3)').text()
    ).toBe('undefined')
  })
})
