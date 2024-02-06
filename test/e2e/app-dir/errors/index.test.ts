import { createNextDescribe } from 'e2e-utils'
import { getRedboxHeader, hasRedbox, retry } from 'next-test-utils'

createNextDescribe(
  'app-dir - errors',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev, isNextStart }) => {
    describe('error component', () => {
      it('should trigger error component when an error happens during rendering', async () => {
        const browser = await next.browser('/client-component')
        await browser.elementByCss('#error-trigger-button').click()

        if (isNextDev) {
          // TODO: investigate desired behavior here as it is currently
          // minimized by default
          // expect(await hasRedbox(browser)).toBe(true)
          // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
        } else {
          await browser
          expect(
            await browser
              .waitForElementByCss('#error-boundary-message')
              .elementByCss('#error-boundary-message')
              .text()
          ).toBe('An error occurred: this is a test')
        }
      })

      it('should trigger error component when an error happens during server components rendering', async () => {
        const browser = await next.browser('/server-component')

        if (isNextDev) {
          expect(
            await browser
              .waitForElementByCss('#error-boundary-message')
              .elementByCss('#error-boundary-message')
              .text()
          ).toBe('this is a test')
          expect(
            await browser.waitForElementByCss('#error-boundary-digest').text()
            // Digest of the error message should be stable.
          ).not.toBe('')
          // TODO-APP: ensure error overlay is shown for errors that happened before/during hydration
          // expect(await hasRedbox(browser)).toBe(true)
          // expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
        } else {
          await browser
          expect(
            await browser.waitForElementByCss('#error-boundary-message').text()
          ).toBe(
            'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'
          )
          expect(
            await browser.waitForElementByCss('#error-boundary-digest').text()
            // Digest of the error message should be stable.
          ).not.toBe('')
        }
      })

      it('should use default error boundary for prod and overlay for dev when no error component specified', async () => {
        const browser = await next.browser('/global-error-boundary/client')
        await browser.elementByCss('#error-trigger-button').click()

        if (isNextDev) {
          expect(await hasRedbox(browser)).toBe(true)
          expect(await getRedboxHeader(browser)).toMatch(/this is a test/)
        } else {
          expect(
            await browser.waitForElementByCss('body').elementByCss('h2').text()
          ).toBe(
            'Application error: a client-side exception has occurred (see the browser console for more information).'
          )
        }
      })

      it('should display error digest for error in server component with default error boundary', async () => {
        const browser = await next.browser('/global-error-boundary/server')

        if (isNextDev) {
          expect(await hasRedbox(browser)).toBe(true)
          expect(await getRedboxHeader(browser)).toMatch(/custom server error/)
        } else {
          expect(
            await browser.waitForElementByCss('body').elementByCss('h2').text()
          ).toBe(
            'Application error: a server-side exception has occurred (see the server logs for more information).'
          )
          expect(
            await browser.waitForElementByCss('body').elementByCss('p').text()
          ).toMatch(/Digest: \w+/)
        }
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
          const browser = await next.browser('/ssr-error-client-component')
          const logs = await browser.log()
          const errors = logs
            .filter((x) => x.source === 'error')
            .map((x) => x.message)
            .join('\n')
          expect(errors).toInclude('Error during SSR')
        })

        it('should log the original RSC error trace in production', async () => {
          const logIndex = next.cliOutput.length
          const browser = await next.browser('/server-component')
          const digest = await browser
            .waitForElementByCss('#error-boundary-digest')
            .text()
          const output = next.cliOutput.slice(logIndex)

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

          const output = next.cliOutput.slice(logIndex)
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
  }
)
