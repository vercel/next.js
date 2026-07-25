import { isNextDev, nextTestSetup } from 'e2e-utils'

const testFn =
  process.env.IS_WEBPACK_TEST || process.env.NEXT_RSPACK
    ? describe.skip
    : describe

testFn('import.meta.env', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) return

  it('exposes built-in environment values on the server and client', async () => {
    const browser = await next.browser('/')
    const expectedMode = isNextDev ? 'development' : 'production'

    expect(
      JSON.parse(await browser.elementByCss('#server-env dd').text())
    ).toEqual({
      DEV: isNextDev,
      PROD: !isNextDev,
      MODE: expectedMode,
      BASE_URL: '/',
      SSR: true,
    })
    expect(
      JSON.parse(await browser.elementByCss('#client-env dd').text())
    ).toEqual({
      DEV: isNextDev,
      PROD: !isNextDev,
      MODE: expectedMode,
      BASE_URL: '/',
      SSR: false,
    })
  })

  it('supports static bracket access and unknown properties', async () => {
    const browser = await next.browser('/')
    const $ = await next.render$('/')
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
