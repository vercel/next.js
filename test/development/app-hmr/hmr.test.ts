import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import path from 'path'

const envFile = '.env.development.local'

describe(`app-dir-hmr`, () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    patchFileDelay: 1000,
  })

  describe('filesystem changes', () => {
    it('should not continously poll when hitting a not found page', async () => {
      let requestCount = 0

      const browser = await next.browser('/does-not-exist', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (url.pathname === '/does-not-exist') {
              requestCount++
            }
          })
        },
      })
      const body = await browser.elementByCss('body').text()
      expect(body).toContain('404')

      await waitFor(3000)

      expect(requestCount).toBe(1)
    })

    it('should not break when renaming a folder', async () => {
      const browser = await next.browser('/folder')
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello')

      // Rename folder
      await next.renameFolder('app/folder', 'app/folder-renamed')

      try {
        // Should be 404 in a few seconds
        await retry(async () => {
          const body = await browser.elementByCss('body').text()
          expect(body).toContain('404')
        })

        // The new page should be rendered
        const newHTML = await next.render('/folder-renamed')
        expect(newHTML).toContain('Hello')

        expect(next.cliOutput).not.toContain('FATAL')
      } finally {
        // Rename it back
        await next.renameFolder('app/folder-renamed', 'app/folder')
      }
    })

    it('should update server components after navigating to a page with a different runtime', async () => {
      const browser = await next.browser('/env/node')
      expect(await browser.elementByCss('p').text()).toBe('mac')

      await browser.loadPage(`${next.url}/env/edge`)
      await browser.eval('window.__TEST_NO_RELOAD = true')
      expect(await browser.elementByCss('p').text()).toBe('mac')

      const getCliOutput = next.getCliOutputFromHere()
      await next.patchFile(envFile, 'MY_DEVICE="ipad"', async () => {
        await waitFor(() => getCliOutput().includes('Reload env'))

        // use an extra-long timeout since the environment reload can be a
        // little slow (especially on overloaded CI servers)
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        }, 5000 /* ms */)

        expect(await browser.eval('window.__TEST_NO_RELOAD === true')).toBe(
          true
        )
      })

      // ensure it's restored back to "mac" before the next test
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('mac')
      })

      expect(next.cliOutput).not.toContain('FATAL')
    })

    it('should have no unexpected action error for hmr', async () => {
      expect(next.cliOutput).not.toContain('Unexpected action')
    })

    it('can navigate cleanly to a page that requires a change in the Webpack runtime', async () => {
      // This isn't a very accurate test since the Webpack runtime is somewhat an implementation detail.
      // To ensure this is still valid, check the `*/webpack.*.hot-update.js` network response content when the navigation is triggered.
      // If there is new functionality added, the test is still valid.
      // If not, the test doesn't cover anything new.
      // TODO: Enforce console.error assertions or MPA navigation assertions in all tests instead.
      const browser = await next.browser('/bundler-runtime-changes')
      await browser.eval('window.__TEST_NO_RELOAD = true')

      await browser
        .elementByCss('a')
        .click()
        .waitForElementByCss('[data-testid="new-runtime-functionality-page"]', {
          state: 'attached',
        })

      const logs = await browser.log()
      // TODO: Should assert on all logs but these are cluttered with logs from our test utils (e.g. playwright tracing or webdriver)
      expect(logs).toEqual(
        expect.arrayContaining([
          {
            message: expect.stringContaining('[Fast Refresh] done in'),
            source: 'log',
          },
        ])
      )
      expect(logs).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'error',
          }),
        ])
      )
      // No MPA navigation triggered
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toEqual(true)

      expect(next.cliOutput).not.toContain('FATAL')
    })
  })
})
