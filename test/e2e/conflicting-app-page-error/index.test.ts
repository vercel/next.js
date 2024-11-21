import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxHeader,
  getRedboxSource,
  getRedboxDescription,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('Conflict between app file and pages file', () => {
  const { isTurbopack, next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should print error for conflicting app/page', async () => {
      const { cliOutput } = await next.build()
      if (process.env.TURBOPACK) {
        expect(cliOutput).toContain(
          'App Router and Pages Router both match path: /'
        )
        expect(cliOutput).toContain(
          'App Router and Pages Router both match path: /another'
        )
      } else {
        expect(cliOutput).toMatch(
          /Conflicting app and page files? (were|was) found/
        )

        for (const [pagePath, appPath] of [
          ['pages/index.js', 'app/page.js'],
          ['pages/another.js', 'app/another/page.js'],
        ]) {
          expect(cliOutput).toContain(`"${pagePath}" - "${appPath}"`)
        }
      }

      expect(cliOutput).not.toContain('/non-conflict-pages')
      expect(cliOutput).not.toContain('/non-conflict')
    })
  }

  async function containConflictsError(browser, conflicts) {
    if (process.env.TURBOPACK) {
      expect(await getRedboxDescription(browser)).toContain(
        'App Router and Pages Router both match path:'
      )
    }

    if (!process.env.TURBOPACK) {
      for (const pair of conflicts) {
        expect(await getRedboxSource(browser)).toContain(
          `"${pair[0]}" - "${pair[1]}"`
        )
      }
    }
  }

  if (isNextDev) {
    it('should show error overlay for /another', async () => {
      await next.start()
      const browser = await next.browser('/another')
      await assertHasRedbox(browser, {
        pageResponseCode: isTurbopack
          ? 500
          : // TODO(veil): Why no 500 in Webpack
            undefined,
      })
      await containConflictsError(browser, [
        ['pages/index.js', 'app/page.js'],
        ['pages/another.js', 'app/another/page.js'],
      ])
    })

    it('should show error overlay for /', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser, {
        pageResponseCode: isTurbopack
          ? 500
          : // TODO(veil): Why no 500 in Webpack
            undefined,
      })
      await containConflictsError(browser, [
        ['pages/index.js', 'app/page.js'],
        ['pages/another.js', 'app/another/page.js'],
      ])
    })

    it('should support hmr with conflicts', async () => {
      const browser = await next.browser('/')
      await assertHasRedbox(browser, {
        pageResponseCode: isTurbopack
          ? 500
          : // TODO(veil): Why no 500 in Webpack
            undefined,
      })

      await next.renameFile('pages/index.js', 'pages/index2.js')
      await next.renameFile('pages/another.js', 'pages/another2.js')

      // Wait for successful recompilation
      await browser.loadPage(next.url + '/')
      await assertNoRedbox(browser)
      expect(await browser.elementByCss('p').text()).toContain('index - app')

      await browser.loadPage(next.url + '/another')
      expect(await browser.elementByCss('p').text()).toBe('another - app')
    })

    it('should not show error overlay for non conflict pages under app or pages dir', async () => {
      const browser = await next.browser('/non-conflict')
      await assertNoRedbox(browser)
      expect(await getRedboxHeader(browser)).toBeUndefined()
      expect(await browser.elementByCss('p').text()).toBe('non-conflict app')

      await browser.loadPage(next.url + '/non-conflict-pages')
      await assertNoRedbox(browser)
      expect(await getRedboxHeader(browser)).toBeUndefined()
      expect(await browser.elementByCss('h1').text()).toBe('non-conflict pages')
    })

    it('should error again when there is new conflict', async () => {
      const browser = await next.browser('/')
      await assertNoRedbox(browser)

      // Re-trigger the conflicted errors
      await next.renameFile('pages/index2.js', 'pages/index.js')
      await assertHasRedbox(browser, {
        pageResponseCode: isTurbopack
          ? // TODO(veil): Why two 500 in Turbopack?
            [500, 500]
          : // TODO(veil): Why no 500 in Webpack?
            undefined,
      })
      await containConflictsError(browser, [['pages/index.js', 'app/page.js']])
    })
  }
})
