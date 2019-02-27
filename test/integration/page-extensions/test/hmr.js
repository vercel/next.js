/* eslint-env jest */
/* global browser */
import { join } from 'path'
import { waitFor } from 'next-test-utils'
import { getElementText } from 'puppet-utils'
import { readFileSync, writeFileSync } from 'fs'

export default (context, renderViaHTTP) => {
  describe('Hot Module Reloading', () => {
    it('should reload typescript file without refresh', async () => {
      const page = await browser.newPage()
      const pagePath = join(__dirname, '../', 'pages', 'hmr', 'some-page.tsx')
      const originalContent = readFileSync(pagePath, 'utf8')
      const editedContent = originalContent.replace('Increment', 'INCREMENT')
      try {
        await page.goto(context.server.getURL('/hmr/some-page'))
        /* istanbul ignore next */
        const randomNumber = await page.evaluate(() => window.HMR_RANDOM_NUMBER)
        const originalButtonText = await getElementText(page, 'button')
        expect(originalButtonText).toBe('Increment')

        // Change the about.js page
        writeFileSync(pagePath, editedContent, 'utf8')

        // wait for 5 seconds
        await waitFor(5000)
        /* istanbul ignore next */
        const randomNumberAfterEdit = await page.evaluate(() => window.HMR_RANDOM_NUMBER)
        expect(randomNumberAfterEdit).toBe(randomNumber)
        const updatedButtonText = await getElementText(page, 'button')
        expect(updatedButtonText).toBe('INCREMENT')
      } finally {
        // restore the about page content.
        writeFileSync(pagePath, originalContent, 'utf8')
        await page.close()
      }
    })
  })
}
