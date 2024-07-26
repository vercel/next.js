import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

const envFile = '.env.development.local'

describe(`app-dir-hmr`, () => {
  const { next } = nextTestSetup({
    files: __dirname,
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
      } finally {
        // Rename it back
        await next.renameFolder('app/folder-renamed', 'app/folder')
      }
    })

    it('should update server components after navigating to a page with a different runtime', async () => {
      const browser = await next.browser('/env/node')
      await browser.loadPage(`${next.url}/env/edge`)
      await browser.eval('window.__TEST_NO_RELOAD = true')

      expect(await browser.elementByCss('p').text()).toBe('mac')
      await next.patchFile(envFile, 'MY_DEVICE="ipad"')

      try {
        const logs = await browser.log()

        if (process.env.TURBOPACK) {
          await retry(async () => {
            const fastRefreshLogs = logs.filter((log) => {
              return log.message.startsWith('[Fast Refresh]')
            })
            // FIXME:  3+ "rebuilding" but no "done" is confusing.
            // There may actually be more "rebuilding" but not reliably.
            // To ignore this flakiness, we just assert on subset matches.
            // Once the  bug is fixed, each "rebuilding" should be paired with a "done in" exactly.
            expect(fastRefreshLogs).toEqual(
              expect.arrayContaining([
                { source: 'log', message: '[Fast Refresh] rebuilding' },
                { source: 'log', message: '[Fast Refresh] rebuilding' },
                { source: 'log', message: '[Fast Refresh] rebuilding' },
              ])
            )
            // FIXME: Turbopack should have matching "done in" for each "rebuilding"
            expect(logs).not.toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  message: expect.stringContaining('[Fast Refresh] done in'),
                  source: 'log',
                }),
              ])
            )
          })
        } else {
          await retry(
            async () => {
              const envValue = await browser.elementByCss('p').text()
              const mpa = await browser.eval(
                'window.__TEST_NO_RELOAD === undefined'
              )
              // Used to be flaky but presumably no longer is.
              // If this flakes again, please add the received value as a comment.
              expect({ envValue, mpa }).toEqual({
                envValue: 'ipad',
                mpa: false,
              })
            },
            // Very slow Hot Update for some reason.
            // May be related to receiving 3 rebuild events but only one finish event
            5000
          )

          const fastRefreshLogs = logs.filter((log) => {
            return log.message.startsWith('[Fast Refresh]')
          })
          expect(fastRefreshLogs).toEqual([
            { source: 'log', message: '[Fast Refresh] rebuilding' },
            {
              source: 'log',
              message: expect.stringContaining('[Fast Refresh] done in '),
            },
            { source: 'log', message: '[Fast Refresh] rebuilding' },
            { source: 'log', message: '[Fast Refresh] rebuilding' },
            {
              source: 'log',
              message: expect.stringContaining('[Fast Refresh] done in '),
            },
            {
              source: 'log',
              message: expect.stringContaining('[Fast Refresh] done in '),
            },
          ])
        }
      } finally {
        // TOOD: use sandbox instead
        await next.patchFile(envFile, 'MY_DEVICE="mac"')
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('mac')
        })
      }
    })

    it('should update server components pages when env files is changed (nodejs)', async () => {
      const browser = await next.browser('/env/node')
      expect(await browser.elementByCss('p').text()).toBe('mac')
      await next.patchFile(envFile, 'MY_DEVICE="ipad"')

      const logs = await browser.log()
      await retry(async () => {
        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            }),
          ])
        )
      })

      try {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        })

        if (process.env.TURBOPACK) {
          // FIXME: Turbopack should have matching "done in" for each "rebuilding"
          expect(logs).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('[Fast Refresh] done in'),
                source: 'log',
              }),
            ])
          )
        } else {
          expect(logs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('[Fast Refresh] done in'),
                source: 'log',
              }),
            ])
          )
        }
      } finally {
        // TOOD: use sandbox instead
        await next.patchFile(envFile, 'MY_DEVICE="mac"')
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('mac')
        })
      }
    })

    it('should update server components pages when env files is changed (edge)', async () => {
      const browser = await next.browser('/env/edge')
      expect(await browser.elementByCss('p').text()).toBe('mac')
      await next.patchFile(envFile, 'MY_DEVICE="ipad"')

      const logs = await browser.log()
      await retry(async () => {
        expect(logs).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            }),
          ])
        )
      })

      try {
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('ipad')
        })

        if (process.env.TURBOPACK) {
          // FIXME: Turbopack should have matching "done in" for each "rebuilding"
          expect(logs).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('[Fast Refresh] done in'),
                source: 'log',
              }),
            ])
          )
        } else {
          expect(logs).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('[Fast Refresh] done in'),
                source: 'log',
              }),
            ])
          )
        }
      } finally {
        // TOOD: use sandbox instead
        await next.patchFile(envFile, 'MY_DEVICE="mac"')
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('mac')
        })
      }
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
        .waitForElementByCss('[data-testid="new-runtime-functionality-page"]')

      const logs = await browser.log()
      // TODO: Should assert on all logs but these are cluttered with logs from our test utils (e.g. playwright tracing or webdriver)
      if (process.env.TURBOPACK) {
        // FIXME: logging "rebuilding" multiple times instead of closing it of with "done in"
        // Should just not branch here and have the same logs as Webpack.
        expect(logs).toEqual(
          expect.arrayContaining([
            {
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            },
            {
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            },
            {
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            },
          ])
        )
        expect(logs).not.toEqual(
          expect.arrayContaining([
            {
              message: expect.stringContaining('[Fast Refresh] done in'),
              source: 'log',
            },
          ])
        )
      } else {
        expect(logs).toEqual(
          expect.arrayContaining([
            {
              message: '[Fast Refresh] rebuilding',
              source: 'log',
            },
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
      }
      // No MPA navigation triggered
      expect(await browser.eval('window.__TEST_NO_RELOAD')).toEqual(true)
    })
  })
})
