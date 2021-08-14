/* eslint-env jest */

import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { check } from 'next-test-utils'

export default (context, render) => {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  it('should resolve suspense modules on server side if suspense', async () => {
    const $ = await get$('/suspense/no-preload')
    const nextData = JSON.parse($('#__NEXT_DATA__').text())
    const content = $('#__next').text()
    expect(content).toBe('barfoo')
    expect(nextData.dynamicIds).toBeUndefined()
  })

  it('should resolve suspense on server side if not suspended on server', async () => {
    const $ = await get$('/suspense/no-thrown')
    const html = $('body').html()
    // there might be html comments between text, test hello only
    expect(html).toContain('hello')
    expect(JSON.parse($('#__NEXT_DATA__').text()).dynamicIds).toBeUndefined()
  })

  it('should resolve suspense on server side if suspended on server', async () => {
    const $ = await get$('/suspense/thrown')
    const html = $('body').html()
    expect(html).toContain('hello')
    expect(JSON.parse($('#__NEXT_DATA__').text()).dynamicIds).toBeUndefined()
  })

  it('should hydrate suspenses on client side if suspended on server', async () => {
    let browser
    try {
      browser = await webdriver(context.appPort, '/suspense/thrown')
      await check(() => browser.elementByCss('body').text(), /hello/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}
