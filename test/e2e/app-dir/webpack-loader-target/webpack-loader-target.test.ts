import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-target', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('exposes the server compilation target to loaders', async () => {
    const $ = await next.render$('/')
    expect($('#server-target').text()).toBe('"node"')
  })

  it('exposes the browser compilation target to loaders', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#client-target').text()).toBe('"web"')
  })
})
