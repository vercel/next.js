import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('app-dir - errors', () => {
  const { next, isNextDev, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  describe('error component', () => {
    it('should trigger error component when an error happens during rendering', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/client-component', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await browser.elementByCss('#error-trigger-button').click()

      if (isNextDev) {
        // TODO: investigate desired behavior here as it is currently
        // minimized by default
        // await assertHasRedbox(browser)
        // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
      } else {
        expect(
          await browser.waitForElementByCss('#error-boundary-message').text()
        ).toBe('An error occurred: this is a test')
      }

      // Handled by custom error boundary.
      expect(pageErrors).toEqual([])
    })

    it('should trigger error component when an error happens during server components rendering', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/server-component', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'this is a test'
          : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')

      if (isNextDev) {
        // TODO-APP: ensure error overlay is shown for errors that happened before/during hydration
        // await assertHasRedbox(browser)
        // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
      }

      // Handled by custom error boundary.
      expect(pageErrors).toEqual([])
    })

    it('should preserve custom digests', async () => {
      const browser = await next.browser('/server-component/custom-digest')

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'this is a test'
          : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
      ).toBe('custom')
      expect(stripAnsi(next.cliOutput)).toEqual(
        expect.stringMatching(
          isNextDev
            ? /Error: this is a test.*digest: 'custom'/s
            : /Error: this is a test.*digest: 'custom'/s
        )
      )
    })

    it('should trigger error component when undefined is thrown during server components rendering', async () => {
      const browser = await next.browser('/server-component/throw-undefined')

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'undefined'
          : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      expect(stripAnsi(next.cliOutput)).toEqual(
        expect.stringMatching(
          isNextDev
            ? /Error: An undefined error was thrown.*digest: '\d+'/s
            : /Error: undefined.*digest: '\d+'/s
        )
      )
    })

    it('should trigger error component when null is thrown during server components rendering', async () => {
      const browser = await next.browser('/server-component/throw-null')

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'null'
          : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      expect(stripAnsi(next.cliOutput)).toEqual(
        expect.stringMatching(
          isNextDev
            ? /Error: A null error was thrown.*digest: '\d+'/s
            : /Error: null.*digest: '\d+'/s
        )
      )
    })

    it('should trigger error component when a string is thrown during server components rendering', async () => {
      const browser = await next.browser('/server-component/throw-string')

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'this is a test'
          : 'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      expect(stripAnsi(next.cliOutput)).toEqual(
        expect.stringMatching(
          isNextDev
            ? /Error: this is a test.*digest: '\d+'/s
            : /Error: An error occurred in the Server Components render.*digest: '\d+'/s
        )
      )
    })

    it('should use default error boundary for prod and overlay for dev when no error component specified', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/global-error-boundary/client', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await browser.elementByCss('#error-trigger-button').click()

      if (isNextDev) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "this is a test",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "app/global-error-boundary/client/page.js (8:11) @ Page
         >  8 |     throw new Error('this is a test')
              |           ^",
           "stack": [
             "Page app/global-error-boundary/client/page.js (8:11)",
           ],
         }
        `)
      } else {
        expect(
          await browser.waitForElementByCss('body').elementByCss('h2').text()
        ).toBe(
          'Application error: a client-side exception has occurred while loading localhost (see the browser console for more information).'
        )
      }

      expect(pageErrors).toEqual([
        expect.objectContaining({
          message: 'this is a test',
        }),
      ])
    })

    it('should display error digest for error in server component with default error boundary', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/global-error-boundary/server', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })

      if (isNextDev) {
        await expect(browser).toDisplayRedbox(`
          {
            "description": "custom server error",
            "environmentLabel": "Server",
            "label": "Runtime Error",
            "source": "app/global-error-boundary/server/page.js (2:9) @ Page
          > 2 |   throw Error('custom server error')
              |         ^",
            "stack": [
              "Page app/global-error-boundary/server/page.js (2:9)",
            ],
          }
        `)
      } else {
        expect(
          await browser.waitForElementByCss('body').elementByCss('h2').text()
        ).toBe(
          'Application error: a server-side exception has occurred while loading localhost (see the server logs for more information).'
        )
        expect(
          await browser.waitForElementByCss('body').elementByCss('p').text()
        ).toMatch(/Digest: \w+/)
      }

      expect(pageErrors).toEqual([
        expect.objectContaining({
          message: isNextDev
            ? 'custom server error'
            : 'An error occurred in the Server Components render. ' +
              'The specific message is omitted in production builds to avoid leaking sensitive details. ' +
              'A digest property is included on this error instance which may provide additional details about the nature of the error.',
        }),
      ])
    })

    // production tests
    if (isNextStart) {
      it('should allow resetting error boundary', async () => {
        const browser = await next.browser('/client-component')

        // Try triggering and resetting a few times in a row
        for (let i = 0; i < 5; i++) {
          await browser
            .elementByCss('#error-trigger-button')
            .click()
            .waitForElementByCss('#error-boundary-message')

          expect(
            await browser.elementByCss('#error-boundary-message').text()
          ).toBe('An error occurred: this is a test')

          await browser
            .elementByCss('#reset')
            .click()
            .waitForElementByCss('#error-trigger-button')

          expect(
            await browser.elementByCss('#error-trigger-button').text()
          ).toBe('Trigger Error!')
        }
      })

      it('should hydrate empty shell to handle server-side rendering errors', async () => {
        const pageErrors: unknown[] = []
        await next.browser('/ssr-error-client-component', {
          beforePageLoad: (page) => {
            page.on('pageerror', (error: unknown) => {
              pageErrors.push(error)
            })
          },
        })
        expect(pageErrors).toEqual([
          expect.objectContaining({ message: 'Error during SSR' }),
        ])
      })

      it('should log the original RSC error trace in production', async () => {
        const logIndex = next.cliOutput.length
        const browser = await next.browser('/server-component')
        const digest = await browser
          .waitForElementByCss('#error-boundary-digest')
          .text()
        const output = stripAnsi(next.cliOutput.slice(logIndex))

        // Log the original rsc error trace
        expect(output).toContain('Error: this is a test')
        // Does not include the react renderer error for server actions
        expect(output).not.toContain(
          'Error: An error occurred in the Server Components render'
        )

        expect(output).toContain(`digest: '${digest}'`)
      })

      it('should log the original Server Actions error trace in production', async () => {
        const logIndex = next.cliOutput.length
        const browser = await next.browser('/server-actions')
        // trigger server action
        await browser.elementByCss('#button').click()
        // wait for response
        let digest
        await retry(async () => {
          digest = await browser.waitForElementByCss('#digest').text()
          expect(digest).toMatch(/\d+/)
        })

        const output = stripAnsi(next.cliOutput.slice(logIndex))
        // Log the original rsc error trace
        expect(output).toContain('Error: server action test error')
        // Does not include the react renderer error for server actions
        expect(output).not.toContain(
          'Error: An error occurred in the Server Components render'
        )
        expect(output).toContain(`digest: '${digest}'`)
      })
    }
  })
})
