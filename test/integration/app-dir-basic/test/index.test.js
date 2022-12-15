/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { runDevSuite, runProdSuite, renderViaHTTP } from 'next-test-utils'

import webdriver from 'next-webdriver'
const appDir = join(__dirname, '..')

function runTests(context, env) {
  describe('App Dir Basic', () => {
    it('should render html properly', async () => {
      const $index = cheerio.load(await renderViaHTTP(context.appPort, '/'))
      const $blog = cheerio.load(await renderViaHTTP(context.appPort, '/blog'))

      expect($index('#home').text()).toBe('this is home')
      expect($blog('#blog').text()).toBe('this is blog')
    })

    it('should hydrate pages properly', async () => {
      const browser = await webdriver(context.appPort, '/')
      const indexHtml = await browser.waitForElementByCss('#home').text()
      const url = await browser.url()
      await browser.loadPage(url + 'blog')
      const blogHtml = await browser.waitForElementByCss('#blog').text()

      expect(indexHtml).toBe('this is home')
      expect(blogHtml).toBe('this is blog')
    })
  })
}

runDevSuite('App Dir Basic', appDir, { runTests })
runProdSuite('App Dir Basic', appDir, { runTests })
