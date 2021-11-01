/* eslint-env jest */
import webdriver from 'next-webdriver'

export default function (context) {
  it('should include global styles under `concurrentFeatures: true`', async () => {
    const browser = await webdriver(context.appPort, '/global-styles')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
  it('should include global styles with `serverComponents: true`', async () => {
    const browser = await webdriver(context.appPort, '/global-styles-rsc')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
  // TODO: fix this test
  // it.skip('should include css modules with `serverComponents: true`', async () => {
  //   const browser = await webdriver(context.appPort, '/css-modules')
  //   const currentColor = await browser.eval(
  //     `window.getComputedStyle(document.querySelector('h1')).color`
  //   )
  //   expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  // })
}
