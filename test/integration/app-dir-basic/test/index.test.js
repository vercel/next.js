/* eslint-env jest */

import { join } from 'path'
import { runDevSuite, runProdSuite, renderViaHTTP } from 'next-test-utils'

import webdriver from 'next-webdriver'
const appDir = join(__dirname, '..')

function runTests(context, env) {
  describe('App Dir Basic', () => {
    it('should render html properly', async () => {
      const indexHtml = await renderViaHTTP(context.appPort, '/')
      const blogHtml = await renderViaHTTP(context.appPort, '/blog')

      expect(indexHtml).toContain('page')
      expect(blogHtml).toContain('blog')
    })

    it('should hydrate pages properly', async () => {
      const browser = await webdriver(context.appPort, '/')
      const indexHtml = await browser.waitForElementByCss('body').text()
      const url = await browser.url()
      await browser.loadPage(url + 'blog')
      const blogHtml = await browser.waitForElementByCss('body').text()

      expect(indexHtml).toContain('page')
      expect(blogHtml).toContain('blog')
    })
  })
}

runDevSuite('App Dir Basic', appDir, { runTests })
runProdSuite('App Dir Basic', appDir, { runTests })
