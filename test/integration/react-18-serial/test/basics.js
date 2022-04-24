/* eslint-env jest */

import webdriver from 'next-webdriver'
import { renderViaHTTP } from 'next-test-utils'

export default (context, env) => {
  it('renders pages in serial', async () => {
    const html = await renderViaHTTP(context.appPort, '/')
    expect(html).toMatch(/<meta name="test-main-content-length" value="\d+"\/>/)
  })

  it('hydrates correctly for normal page', async () => {
    const browser = await webdriver(context.appPort, '/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
    expect(await browser.elementById('react-dom-version').text()).toMatch(/18/)
  })
}
