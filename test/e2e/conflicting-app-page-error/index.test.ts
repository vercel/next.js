import { getRedboxHeader, hasRedbox, check } from 'next-test-utils'
import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'Conflict between app file and pages file',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev, isNextStart }) => {
    if (isNextStart) {
      it('should print error for conflicting app/page', async () => {
        await check(
          () => next.cliOutput,
          /Conflicting app and page files were found/
        )

        for (const [pagePath, appPath] of [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ]) {
          expect(next.cliOutput).toContain(`"${pagePath}" - "${appPath}"`)
        }
        expect(next.cliOutput).not.toContain('/non-conflict-pages')
        expect(next.cliOutput).not.toContain('/non-conflict')
      })
    }

    if (isNextDev) {
      it('should show error overlay for /', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxHeader(browser)).toContain(
          'Conflicting app and page file found: "app/page.js" and "pages/index.js". Please remove one to continue.'
        )
      })

      it('should show error overlay for /another', async () => {
        const browser = await next.browser('/another')
        expect(await hasRedbox(browser, true)).toBe(true)
        expect(await getRedboxHeader(browser)).toContain(
          'Conflicting app and page file found: "app/another/page.js" and "pages/another.js". Please remove one to continue.'
        )
      })

      it('should support hmr with conflicts', async () => {
        await next.renameFile('pages/index.js', 'pages/index2.js')
        await next.renameFile('app/page.js', 'app/page2.js')

        const browser = await next.browser('/')
        expect(await hasRedbox(browser, false)).toBe(false)

        expect(await browser.elementByCss('p').text()).toBe('index page - app')

        await browser.loadPage(next.url + '/another')
        expect(await browser.elementByCss('p').text()).toBe('another app')

        await next.renameFile('app/page2.js', 'app/page.js')

        await check(async () => {
          expect(await hasRedbox(browser, true)).toBe(true)
          expect(await getRedboxHeader(browser)).toContain(
            'Conflicting app and page file found: "app/another/page.js" and "pages/another.js". Please remove one to continue.'
          )
          return 'success'
        }, /success/)
      })

      it('should not show error overlay for /non-conflict-pages', async () => {
        const browser = await next.browser('/non-conflict-pages')
        expect(await hasRedbox(browser, false)).toBe(false)
        expect(await getRedboxHeader(browser)).toBe(null)
        expect(await browser.elementByCss('h1').text()).toBe(
          'non-conflict-pages!'
        )
      })

      it('should not show error overlay for /non-conflict', async () => {
        const browser = await next.browser('/non-conflict')
        expect(await hasRedbox(browser, false)).toBe(false)
        expect(await getRedboxHeader(browser)).toBe(null)
        expect(await browser.elementByCss('p').text()).toBe('non-conflict app')
      })
    }
  }
)
