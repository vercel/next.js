/* eslint-env jest */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { renderViaHTTP, check } from 'next-test-utils'

export default function (context) {
  it('should render server components correctly', async () => {
    const homeHTML = await renderViaHTTP(context.appPort, '/', null, {
      headers: {
        'x-next-test-client': 'test-util',
      },
    })

    // should have only 1 DOCTYPE
    expect(homeHTML).toMatch(/^<!DOCTYPE html><html/)

    expect(homeHTML).toContain('component:index.server')
    expect(homeHTML).toContain('env:env_var_test')
    expect(homeHTML).toContain('header:test-util')
    expect(homeHTML).toContain('path:/')
    expect(homeHTML).toContain('foo.client')
  })

  it('should support multi-level server component imports', async () => {
    const html = await renderViaHTTP(context.appPort, '/multi')
    expect(html).toContain('bar.server.js:')
    expect(html).toContain('foo.client')
  })

  it('should support next/link in server components', async () => {
    const linkHTML = await renderViaHTTP(context.appPort, '/next-api/link')
    const $ = cheerio.load(linkHTML)
    const linkText = $('div[hidden] > a[href="/"]').text()

    expect(linkText).toContain('go home')

    const browser = await webdriver(context.appPort, '/next-api/link')

    // We need to make sure the app is fully hydrated before clicking, otherwise
    // it will be a full redirection instead of being taken over by the next
    // router. This timeout prevents it being flaky caused by fast refresh's
    // rebuilding event.
    await new Promise((res) => setTimeout(res, 1000))
    await browser.eval('window.beforeNav = 1')

    await browser.waitForElementByCss('#next_id').click()
    await check(() => browser.elementByCss('#query').text(), 'query:1')

    await browser.waitForElementByCss('#next_id').click()
    await check(() => browser.elementByCss('#query').text(), 'query:2')

    expect(await browser.eval('window.beforeNav')).toBe(1)
  })

  it('should suspense next/image in server components', async () => {
    const imageHTML = await renderViaHTTP(context.appPort, '/next-api/image')
    const $ = cheerio.load(imageHTML)
    const imageTag = $('div[hidden] > span > span > img')

    expect(imageTag.attr('src')).toContain('data:image')
  })

  it('should handle multiple named exports correctly', async () => {
    const clientExportsHTML = await renderViaHTTP(
      context.appPort,
      '/client-exports'
    )
    const $clientExports = cheerio.load(clientExportsHTML)
    expect($clientExports('div[hidden] > div').text()).toBe('abcde')

    const browser = await webdriver(context.appPort, '/client-exports')
    const text = await browser.waitForElementByCss('#__next').text()
    expect(text).toBe('abcde')
  })
}
