import { nextTestSetup } from 'e2e-utils'

// DEP0144: the TypeScript config loader reads module.parent in requireFromString,
// so --throw-deprecation prevents this fixture from building or starting.
// @force-gate !futureCompat
describe('webpack-loader-misc', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('exposes the server compilation target and mode to loaders', async () => {
    const $ = await next.render$('/')
    expect($('#server-target').text()).toBe('"node"')
    expect($('#mode').text()).toBe(isNextDev ? 'development' : 'production')
  })

  it('exposes the browser compilation target to loaders', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#client-target').text()).toBe('"web"')
  })
})
