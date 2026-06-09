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
        // await waitForRedbox(browser)
        // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
      } else {
        expect(
          await browser.waitForElementByCss('#error-boundary-message').text()
        ).toBe('An error occurred: this is a test')
      }

      // Handled by custom error boundary.
      expect(pageErrors).toEqual([])
    })

    it('should trigger error component when undefined is thrown from a client component in the browser', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/client-component/throw-undefined', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await browser.elementByCss('#error-trigger-button').click()

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe('An error occurred: undefined')

      // Handled by custom error boundary.
      expect(pageErrors).toEqual([])
    })

    it('should trigger error component when null is thrown from a client component in the browser', async () => {
      const pageErrors: unknown[] = []
      const browser = await next.browser('/client-component/throw-null', {
        beforePageLoad: (page) => {
          page.on('pageerror', (error: unknown) => {
            pageErrors.push(error)
          })
        },
      })
      await browser.elementByCss('#error-trigger-button').click()

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe('An error occurred: null')

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
          : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')

      if (isNextDev) {
        // TODO-APP: ensure error overlay is shown for errors that happened before/during hydration
        // await waitForRedbox(browser)
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
          : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
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
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/server-component/throw-undefined')

      // Non-error values thrown during rendering get wrapped in an Error when transported over RSC,
      // so we expect an error object with a digest.
      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'An error occurred: Error: undefined'
          : 'An error occurred: Error: Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      const cleanCliOutput = stripAnsi(
        next.cliOutput.slice(outputIndex)
      ).replaceAll(/digest: '\d+(@E\d+)'/g, "digest: '<digest>$1'")
      if (isNextDev) {
        expect(cleanCliOutput).toEqual(
          expect.stringMatching(
            /Error: An undefined error was thrown.*digest: '<digest>@E98'/s
          )
        )
      } else {
        expect(cleanCliOutput).toMatchInlineSnapshot(`
         "⨯ Error: undefined
             at stringify (<anonymous>) {
           digest: '<digest>@E394'
         }
         "
        `)
      }
    })

    it('should trigger error component when null is thrown during server components rendering', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/server-component/throw-null')

      // Non-error values thrown during rendering get wrapped in an Error when transported over RSC,
      // so we expect an error object with a digest.

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'An error occurred: Error: null'
          : 'An error occurred: Error: Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      const cleanCliOutput = stripAnsi(
        next.cliOutput.slice(outputIndex)
      ).replaceAll(/digest: '\d+(@E\d+)'/g, "digest: '<digest>$1'")
      if (isNextDev) {
        expect(cleanCliOutput).toEqual(
          expect.stringMatching(
            /Error: A null error was thrown.*digest: '<digest>@E336'/s
          )
        )
      } else {
        expect(cleanCliOutput).toMatchInlineSnapshot(`
         "⨯ Error: null
             at stringify (<anonymous>) {
           digest: '<digest>@E394'
         }
         "
        `)
      }
    })

    it('should trigger error component when a string is thrown during server components rendering', async () => {
      const outputIndex = next.cliOutput.length
      const browser = await next.browser('/server-component/throw-string')

      expect(
        await browser.waitForElementByCss('#error-boundary-message').text()
      ).toBe(
        isNextDev
          ? 'this is a test'
          : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
      )
      expect(
        await browser.waitForElementByCss('#error-boundary-digest').text()
        // Digest of the error message should be stable.
      ).not.toBe('')
      const cleanCliOutput = stripAnsi(
        next.cliOutput.slice(outputIndex)
      ).replaceAll(/digest: '\d+'/g, "digest: '<digest>'")
      if (isNextDev) {
        expect(cleanCliOutput).toEqual(
          expect.stringMatching(/Error: this is a test.*digest: '<digest>'/s)
        )
      } else {
        expect(cleanCliOutput).toMatchInlineSnapshot(`
         "⨯ Error: this is a test
             at stringify (<anonymous>) {
           digest: '<digest>'
         }
         "
        `)
      }
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
          await browser.waitForElementByCss('body').elementByCss('h1').text()
        ).toBe('This page couldn\u2019t load')
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
          await browser.waitForElementByCss('body').elementByCss('h1').text()
        ).toBe('This page couldn\u2019t load')
        // Check digest is displayed
        const bodyText = await browser.waitForElementByCss('body').text()
        expect(bodyText).toMatch(/ERROR \w+/)
      }

      expect(pageErrors).toEqual([
        expect.objectContaining({
          message: isNextDev
            ? 'custom server error'
            : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
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

    describe('retry', () => {
      afterEach(async () => {
        // Always restore __nextTestRecover so it doesn't leak between tests
        await next.fetch('/server-component/recover/set-recover?enabled=false')
      })

      it('should recover Server Component error after retry', async () => {
        const browser = await next.browser('/server-component/recover')

        expect(
          await browser.elementByCss('#error-boundary-message').text()
        ).toBe(
          isNextDev
            ? 'this is a test'
            : 'Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
        )

        // Enable recovery via globalThis.__nextTestRecover
        await next.fetch('/server-component/recover/set-recover')

        await browser
          .elementByCss('#retry')
          .click()
          .waitForElementByCss('#recover')

        expect(await browser.elementByCss('#recover').text()).toBe('Recovered')
      })

      it('should recover Client Component error after retry', async () => {
        const browser = await next.browser('/client-component')

        // Try triggering and retrying a few times in a row
        for (let i = 0; i < 5; i++) {
          await browser
            .elementByCss('#error-trigger-button')
            .click()
            .waitForElementByCss('#error-boundary-message')

          expect(
            await browser.elementByCss('#error-boundary-message').text()
          ).toBe('An error occurred: this is a test')

          await browser
            .elementByCss('#retry')
            .click()
            .waitForElementByCss('#error-trigger-button')

          expect(
            await browser.elementByCss('#error-trigger-button').text()
          ).toBe('Trigger Error!')
        }
      })
    })
  })
})
