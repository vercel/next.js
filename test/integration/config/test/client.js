/* eslint-env jest */
/* global browser */
import { join } from 'path'
import { waitFor } from 'next-test-utils' /* check, File */
import { getElementText, getComputedCSS } from 'puppet-utils'
import { readFileSync, writeFileSync } from 'fs'

export default (context, render) => {
  describe('Configuration', () => {
    it('should have config available on the client', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/next-config'))

      // Wait for client side to load
      await waitFor(10000)

      const serverText = await getElementText(page, '#server-only')
      const serverClientText = await getElementText(page, '#server-and-client')
      const envValue = await getElementText(page, '#env')

      expect(serverText).toBe('')
      expect(serverClientText).toBe('/static')
      expect(envValue).toBe('hello')

      await page.close()
    })

    it('should update css styles using hmr', async () => {
      const page = await browser.newPage()

      try {
        await page.goto(context.server.getURL('/webpack-css'))
        const initialFontSize = await getComputedCSS(page, '.hello-world', 'font-size')

        expect(initialFontSize).toBe('100px')

        const pagePath = join(__dirname, '../', 'components', 'hello-webpack-css.css')

        const originalContent = readFileSync(pagePath, 'utf8')
        const editedContent = originalContent.replace('100px', '200px')

        // Change the page
        writeFileSync(pagePath, editedContent, 'utf8')

        await waitFor(10000)

        try {
          // Check whether the this page has reloaded or not.
          const editedFontSize = await getComputedCSS(page, '.hello-world', 'font-size')

          expect(editedFontSize).toBe('200px')
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      } finally {
        await page.close()
      }
    })

    // it('should update sass styles using hmr', async () => {
    //   const file = new File(join(__dirname, '../', 'components', 'hello-webpack-sass.scss'))
    //   let browser
    //   try {
    //     browser = await webdriver(context.appPort, '/webpack-css')

    //     expect(
    //       await browser.elementByCss('.hello-world').getComputedCss('color')
    //     ).toBe('rgba(255, 255, 0, 1)')

    //     file.replace('yellow', 'red')

    //     await waitFor(10000)

    //     await check(
    //       async () => {
    //         const tag = await browser.elementByCss('.hello-world')
    //         const prop = await tag.getComputedCss('color')

    //         expect(prop).toBe('rgba(255, 0, 0, 1)')
    //         return 'works'
    //       },
    //       /works/
    //     )

    //     file.restore()

    //     await waitFor(10000)

    //     await check(
    //       async () => {
    //         const tag = await browser.elementByCss('.hello-world')
    //         const prop = await tag.getComputedCss('color')
    //         expect(prop).toBe('rgba(255, 255, 0, 1)')
    //         return 'works'
    //       },
    //       /works/
    //     )
    //   } catch (err) {
    //     file.restore()

    //     throw err
    //   } finally {
    //     if (browser) {
    //       browser.close()
    //     }
    //   }
    // })
  })
}
