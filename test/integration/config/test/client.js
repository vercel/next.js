/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils' /* check, File */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export default () => {
  test('should have config available on the client', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/next-config')
    // Wait for client side to load
    await waitFor(10000)

    const serverText = await browser.elementByCss('#server-only').text()
    const serverClientText = await browser
      .elementByCss('#server-and-client')
      .text()
    const envValue = await browser.elementByCss('#env').text()

    await t.expect(serverText).eql('')
    await t.expect(serverClientText).eql('/static')
    await t.expect(envValue).eql('hello')
    await browser.close()
  })

  test('should update css styles using hmr', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/webpack-css')
      const pTag = await browser.elementByCss('.hello-world')
      const initialFontSize = await pTag.getComputedCss('font-size')

      await t.expect(initialFontSize).eql('100px')

      const pagePath = join(
        __dirname,
        '../',
        'components',
        'hello-webpack-css.css'
      )

      const originalContent = readFileSync(pagePath, 'utf8')
      const editedContent = originalContent.replace('100px', '200px')

      // Change the page
      writeFileSync(pagePath, editedContent, 'utf8')

      await waitFor(10000)

      try {
        // Check whether the this page has reloaded or not.
        const editedPTag = await browser.elementByCss('.hello-world')
        const editedFontSize = await editedPTag.getComputedCss('font-size')

        await t.expect(editedFontSize).eql('200px')
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

  // test('should update sass styles using hmr', async t => {
  //   const file = new File(join(__dirname, '../', 'components', 'hello-webpack-sass.scss'))
  //   let browser
  //   try {
  //     browser = await webdriver(t.fixtureCtx.appPort, '/webpack-css')

  //     await t.expect(
  //       await browser.elementByCss('.hello-world').getComputedCss('color')
  //     ).eql('rgba(255, 255, 0, 1)')

  //     file.replace('yellow', 'red')

  //     await waitFor(10000)

  //     await check(
  //       async () => {
  //         const tag = await browser.elementByCss('.hello-world')
  //         const prop = await tag.getComputedCss('color')

  //         await t.expect(prop).eql('rgba(255, 0, 0, 1)')
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
  //         await t.expect(prop).eql('rgba(255, 255, 0, 1)')
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
}
