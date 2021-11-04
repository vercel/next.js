/* eslint-env jest */

import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

export default (context) => {
  it('hydrates correctly for normal page', async () => {
    const browser = await webdriver(context.appPort, '/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
    expect(await browser.elementById('react-dom-version').text()).toMatch(/18/)
  })

  it('should works with suspense in ssg', async () => {
    const res1 = await fetchViaHTTP(context.appPort, '/suspense/thrown')
    const res2 = await fetchViaHTTP(context.appPort, '/suspense/no-thrown')

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('should render fallback without preloads on server side', async () => {
    const html = await renderViaHTTP(context.appPort, '/suspense/no-preload')
    const $ = cheerio.load(html)
    const nextData = JSON.parse($('#__NEXT_DATA__').text())
    const content = $('#__next').text()
    // <Bar> is suspended
    expect(content).toBe('rab')
    expect(nextData.dynamicIds).toBeUndefined()
  })
}
