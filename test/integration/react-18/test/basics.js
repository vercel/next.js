/* eslint-env jest */

import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { renderViaHTTP } from 'next-test-utils'

export default (context, env) => {
  it('should only render once in SSR', async () => {
    await renderViaHTTP(context.appPort, '/')
    expect([...context.stdout.matchAll(/__render__/g)].length).toBe(1)
  })

  it('no warnings for image related link props', async () => {
    await renderViaHTTP(context.appPort, '/')
    expect(context.stderr).not.toContain('Warning: Invalid DOM property')
    expect(context.stderr).not.toContain('Warning: React does not recognize')
  })

  it('hydrates correctly for normal page', async () => {
    const browser = await webdriver(context.appPort, '/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
    expect(await browser.elementById('react-dom-version').text()).toMatch(/18/)
  })

  it('useId() values should match on hydration', async () => {
    const html = await renderViaHTTP(context.appPort, '/use-id')
    const $ = cheerio.load(html)
    const ssrId = $('#id').text()

    const browser = await webdriver(context.appPort, '/use-id')
    const csrId = await browser.eval('document.getElementById("id").innerText')

    expect(ssrId).toEqual(csrId)
  })

  it('should contain dynamicIds in next data for dynamic imports', async () => {
    async function expectToContainPreload(page) {
      const html = await renderViaHTTP(context.appPort, `/${page}`)
      const $ = cheerio.load(html)
      const { dynamicIds } = JSON.parse($('#__NEXT_DATA__').html())

      if (env === 'dev') {
        expect(dynamicIds).toContain(`${page}.js -> ../components/foo`)
      } else {
        expect(dynamicIds.length).toBe(1)
      }
    }
    await expectToContainPreload('dynamic')
    await expectToContainPreload('dynamic-suspense')
  })
}
