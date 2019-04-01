/* eslint-env jest */
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils' /* check, File */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export default (context, render) => {
  describe('Configuration', () => {
    it('should have config available on the client', async () => {
      const browser = await webdriver(context.appPort, '/next-config')
      // Wait for client side to load
      await waitFor(10000)

      const serverText = await browser.elementByCss('#server-only').text()
      const serverClientText = await browser.elementByCss('#server-and-client').text()
      const envValue = await browser.elementByCss('#env').text()

      expect(serverText).toBe('')
      expect(serverClientText).toBe('/static')
      expect(envValue).toBe('hello')
      await browser.close()
    })

    it('should update css styles using hmr', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/webpack-css')
        const pTag = await browser.elementByCss('.hello-world')
        const initialFontSize = await pTag.getComputedCss('font-size')

        expect(initialFontSize).toBe('100px')

        const pagePath = join(__dirname, '../', 'components', 'hello-webpack-css.css')

        const originalContent = readFileSync(pagePath, 'utf8')
        const editedContent = originalContent.replace('100px', '200px')

        // Change the page
        writeFileSync(pagePath, editedContent, 'utf8')

        await waitFor(10000)

        try {
          // Check whether the this page has reloaded or not.
          const editedPTag = await browser.elementByCss('.hello-world')
          const editedFontSize = await editedPTag.getComputedCss('font-size')

          expect(editedFontSize).toBe('200px')
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      } finally {
        if (browser) {
          await browser.close()
        }
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
    //       await browser.close()
    //     }
    //   }
    // })
  })
}
