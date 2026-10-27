import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-node-conditions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { 'condition-loader': 'file:./condition-loader' },
  })

  it('uses Node export conditions for loader packages', async () => {
    const $ = await next.render$('/')
    const expected = $('#node-selected').text()
    expect(expected).toMatch(/^(sync|fallback):addons:input$/)
    expect($('#conditions').text()).toBe(expected)
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#conditions').text()).toBe(expected)
  })
})
