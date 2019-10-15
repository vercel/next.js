/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  check,
  File,
  waitFor,
  getReactErrorOverlayContent,
  getBrowserBodyText
} from 'next-test-utils'

export default renderViaHTTP => {
  test('should recover from 404 after a page has been added', async t => {
    let browser
    const newPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'new-page.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/new-page')

      await t
        .expect(await browser.elementByCss('body').text())
        .match(/This page could not be found/)

      // Add the page
      newPage.write(
        'export default () => (<div id="new-page">the-new-page</div>)'
      )

      await check(() => getBrowserBodyText(browser), /the-new-page/)

      newPage.delete()

      await check(
        () => getBrowserBodyText(browser),
        /This page could not be found/
      )
    } catch (err) {
      newPage.delete()
      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should have installed the react-overlay-editor editor handler', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about1.js')
    )
    try {
      aboutPage.replace('</div>', 'div')
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about1')

      // react-error-overlay uses the following inline style if an editorHandler is installed
      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/style="cursor: pointer;"/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()
      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should detect syntax errors and recover', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about2.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about2')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace('</div>', 'div')

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/Unterminated JSX contents/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()
      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should show the error on all pages', async t => {
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about2.js')
    )
    let browser
    try {
      await renderViaHTTP('/hmr/about2')

      aboutPage.replace('</div>', 'div')

      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/contact')

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/Unterminated JSX contents/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the contact page/)
    } catch (err) {
      aboutPage.restore()
      if (browser) {
        await check(
          () => getBrowserBodyText(browser),
          /This is the contact page/
        )
      }

      throw err
    } finally {
      aboutPage.restore()
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should detect runtime errors on the module scope', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about3.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about3')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace('export', 'aa=20;\nexport')

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/aa is not defined/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } finally {
      aboutPage.restore()
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover from errors in the render function', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about4.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about4')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace(
        'return',
        'throw new Error("an-expected-error");\nreturn'
      )

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/an-expected-error/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()
      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover after exporting an invalid page', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about5.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about5')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace(
        'export default',
        'export default {};\nexport const fn ='
      )

      await check(
        () => getBrowserBodyText(browser),
        /The default export is not a React Component/
      )

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()

      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover after a bad return from the render function', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about6.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about6')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace(
        'export default',
        'export default () => /search/;\nexport const fn ='
      )

      await check(
        () => getBrowserBodyText(browser),
        /Objects are not valid as a React child/
      )

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()

      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover after undefined exported as default', async t => {
    let browser
    const aboutPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'about7.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/about7')
      await check(() => getBrowserBodyText(browser), /This is the about page/)

      aboutPage.replace(
        'export default',
        'export default undefined;\nexport const fn ='
      )

      await check(async () => {
        const txt = await getBrowserBodyText(browser)
        console.log(txt)
        return txt
      }, /The default export is not a React Component/)

      aboutPage.restore()

      await check(() => getBrowserBodyText(browser), /This is the about page/)
    } catch (err) {
      aboutPage.restore()

      if (browser) {
        await check(() => getBrowserBodyText(browser), /This is the about page/)
      }

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover from errors in getInitialProps in client', async t => {
    let browser
    const erroredPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr')
      await browser.elementByCss('#error-in-gip-link').click()

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/an-expected-error-in-gip/)

      erroredPage.replace('throw error', 'return {}')

      await check(() => getBrowserBodyText(browser), /Hello/)

      erroredPage.restore()

      await check(async () => {
        await browser.refresh()
        const text = await browser.elementByCss('body').text()
        if (text.includes('Hello')) {
          await waitFor(2000)
          throw new Error('waiting')
        }
        return getReactErrorOverlayContent(browser)
      }, /an-expected-error-in-gip/)
    } catch (err) {
      erroredPage.restore()

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should recover after an error reported via SSR', async t => {
    let browser
    const erroredPage = new File(
      join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
    )
    try {
      browser = await webdriver(t.fixtureCtx.appPort, '/hmr/error-in-gip')

      await t
        .expect(await getReactErrorOverlayContent(browser))
        .match(/an-expected-error-in-gip/)

      const erroredPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
      )
      erroredPage.replace('throw error', 'return {}')

      await check(() => getBrowserBodyText(browser), /Hello/)

      erroredPage.restore()

      await check(async () => {
        await browser.refresh()
        const text = await getBrowserBodyText(browser)
        if (text.includes('Hello')) {
          await waitFor(2000)
          throw new Error('waiting')
        }
        return getReactErrorOverlayContent(browser)
      }, /an-expected-error-in-gip/)
    } catch (err) {
      erroredPage.restore()

      throw err
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}
