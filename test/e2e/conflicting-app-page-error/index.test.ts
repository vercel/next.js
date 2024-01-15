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
    skipStart: true,
  },
  ({ next, isNextDev, isNextStart }) => {
    if (isNextStart) {
      it('should print error for conflicting app/page', async () => {
        const { cliOutput } = await next.build()
        expect(cliOutput).toMatch(
          /Conflicting app and page files? (were|was) found/
        )

        for (const [pagePath, appPath] of [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ]) {
          expect(cliOutput).toContain(`"${pagePath}" - "${appPath}"`)
        }

        expect(cliOutput).not.toContain('/non-conflict-pages')
        expect(cliOutput).not.toContain('/non-conflict')
      })
    }

    async function containConflictsError(browser, conflicts) {
      await check(async () => {
        expect(await hasRedbox(browser)).toBe(true)
        const redboxSource = await getRedboxSource(browser)
        expect(redboxSource).toMatch(
          /Conflicting app and page files? (were|was) found, please remove the conflicting files to continue:/
        )

        for (const pair of conflicts) {
          expect(redboxSource).toContain(`"${pair[0]}" - "${pair[1]}"`)
        }

        return 'success'
      }, /success/)
    }

    if (isNextDev) {
      it('should show error overlay for /another', async () => {
        await next.start()
        const browser = await next.browser('/another')
        expect(await hasRedbox(browser)).toBe(true)
        await containConflictsError(browser, [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ])
      })

      it('should show error overlay for /', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser)).toBe(true)
        await containConflictsError(browser, [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ])
      })

      it('should support hmr with conflicts', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser)).toBe(true)

        await next.renameFile('pages/index.js', 'pages/index2.js')
        await next.renameFile('pages/another.js', 'pages/another2.js')

        // Wait for successful recompilation
        await browser.loadPage(next.url + '/')
        expect(await hasRedbox(browser)).toBe(false)
        expect(await browser.elementByCss('p').text()).toContain('index - app')

        await browser.loadPage(next.url + '/another')
        expect(await browser.elementByCss('p').text()).toBe('another - app')
      })

      it('should not show error overlay for non conflict pages under app or pages dir', async () => {
        const browser = await next.browser('/non-conflict')
        expect(await hasRedbox(browser)).toBe(false)
        expect(await getRedboxHeader(browser)).toBeUndefined()
        expect(await browser.elementByCss('p').text()).toBe('non-conflict app')

        await browser.loadPage(next.url + '/non-conflict-pages')
        expect(await hasRedbox(browser)).toBe(false)
        expect(await getRedboxHeader(browser)).toBeUndefined()
        expect(await browser.elementByCss('h1').text()).toBe(
          'non-conflict pages'
        )
      })

      it('should error again when there is new conflict', async () => {
        const browser = await next.browser('/')
        expect(await hasRedbox(browser)).toBe(false)

        // Re-trigger the conflicted errors
        await next.renameFile('pages/index2.js', 'pages/index.js')
        expect(await hasRedbox(browser)).toBe(true)
        await containConflictsError(browser, [
          ['pages/index.js', 'app/page.js'],
        ])
      })
    }
  }
)
