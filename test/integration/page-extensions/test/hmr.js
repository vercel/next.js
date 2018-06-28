/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { waitFor } from 'next-test-utils'

export default (context, renderViaHTTP) => {
  describe('Hot Module Reloading', () => {
    it('should reload typescript file without refresh', async () => {
      let browser
      const pagePath = join(__dirname, '../', 'pages', 'hmr', 'some-page.tsx')

      const originalContent = readFileSync(pagePath, 'utf8')
      const editedContent = originalContent.replace('Increment', 'INCREMENT')
      try {
        browser = await webdriver(context.appPort, '/hmr/some-page')
        const randomNumber = await browser.eval('window.HMR_RANDOM_NUMBER')
        const originalButtonText = await browser.elementByCss('button').text()
        expect(originalButtonText).toBe('Increment')

        // Change the about.js page
        writeFileSync(pagePath, editedContent, 'utf8')

        // wait for 5 seconds
        await waitFor(5000)

        const randomNumberAfterEdit = await browser.eval('window.HMR_RANDOM_NUMBER')
        expect(randomNumberAfterEdit).toBe(randomNumber)
        const updatedButtonText = await browser.elementByCss('button').text()
        expect(updatedButtonText).toBe('INCREMENT')
      } finally {
        // restore the about page content.
        writeFileSync(pagePath, originalContent, 'utf8')
        if (browser) {
          browser.close()
        }
      }
    })
  })
}
