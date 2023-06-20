import {
  getRedboxHeader,
  hasRedbox,
  check,
  getRedboxSource,
} from 'next-test-utils'
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

    async function containConflictsError(browser, conflicts) {
      await check(async () => {
        expect(await hasRedbox(browser, true)).toBe(true)
        const redboxSource = await getRedboxSource(browser)
        expect(redboxSource).toContain(
          'Conflicting app and page files were found, please remove the conflicting files to continue:'
        )

        for (const pair of conflicts) {
          expect(redboxSource).toContain(`"${pair[0]}" - "${pair[1]}"`)
        }

        return 'success'
      }, /success/)
    }

    if (isNextDev) {
      it('should show error overlay for /', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser, true)).toBe(true)
        await containConflictsError(browser, [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ])
      })

      it('should show error overlay for /another', async () => {
        const browser = await next.browser('/another')
        expect(await hasRedbox(browser, true)).toBe(true)
        await containConflictsError(browser, [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ])
      })

      it('should support hmr with conflicts', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser, true)).toBe(true)

        await next.renameFile('pages/index.js', 'pages/index2.js')
        await next.renameFile('pages/another.js', 'pages/another2.js')

        await check(async () => {
          expect(await hasRedbox(browser, false)).toBe(false)

          expect(await browser.elementByCss('p').text()).toBe(
            'index page - app'
          )

          await browser.loadPage(next.url + '/another')
          expect(await browser.elementByCss('p').text()).toBe('another app')

          await next.renameFile('pages/page2.js', 'pages/index.js')
          await containConflictsError(browser, [
            ['pages/index.js', 'app/page.js'],
          ])
        })
      })

      it('should not show error overlay for non conflict pages under app or pages dir', async () => {
        const browser = await next.browser('/non-conflict')
        expect(await hasRedbox(browser, false)).toBe(false)
        expect(await getRedboxHeader(browser)).toBe(null)
        expect(await browser.elementByCss('p').text()).toBe('non-conflict app')

        await browser.loadPage(next.url + '/non-conflict-pages')
        expect(await hasRedbox(browser, false)).toBe(false)
        expect(await getRedboxHeader(browser)).toBe(null)
        expect(await browser.elementByCss('h1').text()).toBe(
          'non-conflict pages'
        )
      })
    }
  }
)
