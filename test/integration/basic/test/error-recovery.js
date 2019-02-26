/* eslint-env jest */
/* global browser */
import { join } from 'path'
import fsTimeMachine from 'fs-time-machine'
import { check, waitFor } from 'next-test-utils'
import { getReactErrorOverlayContent, getElementText } from 'puppet-utils'

export default (context, renderViaHTTP) => {
  afterEach(() => fsTimeMachine.restore())

  describe('Error Recovery', () => {
    it('should recover from 404 after a page has been added', async () => {
      const page = await browser.newPage()
      const newPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'new-page.js'))

      await page.goto(context.server.getURL('/hmr/new-page'))
      await expect(page).toMatchElement('body', { text: /This page could not be found/ })

      await newPage.write('export default () => (<div id="new-page">the-new-page</div>)')
      await check(
        () => getElementText(page, 'body'),
        /the-new-page/
      )

      await newPage.delete()
      await check(
        () => getElementText(page, 'body'),
        /This page could not be found/
      )
      await page.close()
    })

    it('should have installed the react-overlay-editor editor handler', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await aboutPage.replace('</div>', 'div')
        await page.goto(context.server.getURL('/hmr/about'))
        expect(await getReactErrorOverlayContent(page)).toMatch(/style="cursor: pointer;"/)

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      }
      await page.close()
    })

    it('should detect syntax errors and recover', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await page.goto(context.server.getURL('/hmr/about'))
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await aboutPage.replace('</div>', 'div')
        expect(await getReactErrorOverlayContent(page)).toMatch(/Unterminated JSX contents/)

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      }
      await page.close()
    })

    it('should show the error on all pages', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await renderViaHTTP('/hmr/about')
        await aboutPage.replace('</div>', 'div')
        await page.goto(context.server.getURL('/hmr/contact'))
        expect(await getReactErrorOverlayContent(page)).toMatch(/Unterminated JSX contents/)

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the contact page/
        )
      } catch (err) {
        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the contact page/
        )
      }
      await page.close()
    })

    it('should detect runtime errors on the module scope', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await page.goto(context.server.getURL('/hmr/about'))
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await aboutPage.replace('export', 'aa=20;\nexport')
        expect(await getReactErrorOverlayContent(page)).toMatch(/aa is not defined/)

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
      }
      await page.close()
    })

    it('should recover from errors in the render function', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await page.goto(context.server.getURL('/hmr/about'))
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')
        expect(await getReactErrorOverlayContent(page)).toMatch(/an-expected-error/)

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
      }
      await page.close()
    })

    it('should recover after exporting an invalid page', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await page.goto(context.server.getURL('/hmr/about'))
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await aboutPage.replace('export default', 'export default {};\nexport const fn =')

        await check(
          () => getElementText(page, 'body'),
          /The default export is not a React Component/
        )

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      }
      await page.close()
    })

    it('should recover after a bad return from the render function', async () => {
      const page = await browser.newPage()
      const aboutPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'about.js'))

      try {
        await page.goto(context.server.getURL('/hmr/about'))
        await expect(page).toMatchElement('p', { text: 'This is the about page.' })
        await aboutPage.replace('export default', 'export default () => /search/;\nexport const fn =')

        await check(
          () => getElementText(page, 'body'),
          /Objects are not valid as a React child/
        )

        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      } catch (err) {
        await aboutPage.restore()
        await check(
          () => getElementText(page, 'body'),
          /This is the about page/
        )
      }
      await page.close()
    })

    it('should recover from errors in getInitialProps in client', async () => {
      const page = await browser.newPage()
      const erroredPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))

      try {
        await page.goto(context.server.getURL('/hmr'))
        await expect(page).toClick('#error-in-gip-link')

        expect(await getReactErrorOverlayContent(page)).toMatch(/an-expected-error-in-gip/)
        erroredPage.replace('throw error', 'return {}')

        await check(
          () => getElementText(page, 'body'),
          /Hello/
        )
        erroredPage.restore()

        await check(
          async () => {
            await page.reload()
            const text = await getElementText(page, 'body')
            if (text.includes('Hello')) {
              await waitFor(2000)
              throw new Error('waiting')
            }
            return getReactErrorOverlayContent(page)
          },
          /an-expected-error-in-gip/
        )
      } catch (err) {
        erroredPage.restore()
      }
      await page.close()
    })

    it('should recover after an error reported via SSR', async () => {
      const page = await browser.newPage()
      const erroredPage = await fsTimeMachine(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))

      try {
        await page.goto(context.server.getURL('/hmr'))
        expect(await getReactErrorOverlayContent(page)).toMatch(/an-expected-error-in-gip/)

        erroredPage.replace('throw error', 'return {}')
        await check(
          () => getElementText(page, 'body'),
          /Hello/
        )
        erroredPage.restore()

        await check(
          async () => {
            await page.reload()
            const text = await getElementText(page, 'body')
            if (text.includes('Hello')) {
              await waitFor(2000)
              throw new Error('waiting')
            }
            return getReactErrorOverlayContent(page)
          },
          /an-expected-error-in-gip/
        )
      } catch (err) {
        erroredPage.restore()
      }
      await page.close()
    })
  })
}
