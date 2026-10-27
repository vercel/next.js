import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-node-conditions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { 'condition-loader': 'file:./condition-loader' },
    // Node 20 only enables module-sync when require(ESM) is enabled explicitly.
    env: { NODE_OPTIONS: '--experimental-require-module' },
  })

  it('uses Node export conditions for loader packages', async () => {
    const $ = await next.render$('/')
    expect($('#conditions').text()).toBe('sync:addons:input')
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#conditions').text()).toBe(
      'sync:addons:input'
    )
  })
})
