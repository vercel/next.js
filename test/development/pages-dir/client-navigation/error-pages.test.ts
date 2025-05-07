/* eslint-env jest */

import { fetchViaHTTP, waitFor } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation on error pages', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should not reload when visiting /_error directly', async () => {
    const { status } = await fetchViaHTTP(next.appPort, '/_error')
    const browser = await next.browser('/_error')

    await browser.eval('window.hello = true')

    // wait on-demand-entries timeout since it can trigger
    // reloading non-stop
    for (let i = 0; i < 15; i++) {
      expect(await browser.eval('window.hello')).toBe(true)
      await waitFor(1000)
    }
    const html = await browser.eval('document.documentElement.innerHTML')

    expect(status).toBe(404)
    expect(html).toContain('This page could not be found')
    expect(html).toContain('404')
  })

  describe('with 404 pages', () => {
    it('should 404 on not existent page', async () => {
      const browser = await next.browser('/non-existent')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should 404 on wrong casing', async () => {
      const browser = await next.browser('/nAv/AbOuT')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should get url dynamic param', async () => {
      const browser = await next.browser('/dynamic/dynamic-part/route')
      expect(await browser.elementByCss('p').text()).toBe('dynamic-part')
      await browser.close()
    })

    it('should 404 on wrong casing of url dynamic param', async () => {
      const browser = await next.browser('/dynamic/dynamic-part/RoUtE')
      expect(await browser.elementByCss('h1').text()).toBe('404')
      expect(await browser.elementByCss('h2').text()).toBe(
        'This page could not be found.'
      )
      await browser.close()
    })

    it('should not 404 for <page>/', async () => {
      const browser = await next.browser('/nav/about/')
      const text = await browser.elementByCss('p').text()
      expect(text).toBe('This is the about page.')
      await browser.close()
    })

    it('should should not contain a page script in a 404 page', async () => {
      const browser = await next.browser('/non-existent')
      const scripts = await browser.elementsByCss('script[src]')
      for (const script of scripts) {
        const src = await script.getAttribute('src')
        expect(src.includes('/non-existent')).toBeFalsy()
      }
      await browser.close()
    })
  })
})
