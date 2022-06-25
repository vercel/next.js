/* eslint-env jest */
import webdriver from 'next-webdriver'

export default function (context) {
  it("should include global styles under `runtime: 'edge'`", async () => {
    const browser = await webdriver(context.appPort, '/global-styles')
    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#red')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
  })
}
