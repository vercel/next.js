import { NextInstance, createNextDescribe } from 'e2e-utils'

async function setupErrorHydrationTests(
  next: NextInstance,
  targetPath: string
) {
  const consoleMessages: string[] = []

  const browser = await next.browser(targetPath, {
    beforePageLoad(page) {
      page.on('console', (event) => {
        consoleMessages.push(event.text())
      })
    },
  })

  return [browser, consoleMessages] as const
}

createNextDescribe(
  'error-hydration',
  {
    files: __dirname,
  },
  ({ next }) => {
    // Recommended for tests that need a full browser
    it('should log no error messages for server-side errors', async () => {
      const [, consoleMessages] = await setupErrorHydrationTests(
        next,
        '/with-error'
      )

      expect(
        consoleMessages.find((message) =>
          message.startsWith('A client-side exception has occurred')
        )
      ).toBeUndefined()

      expect(
        consoleMessages.find(
          (message) =>
            message ===
            '{name: Internal Server Error., message: 500 - Internal Server Error., statusCode: 500}'
        )
      ).toBeUndefined()
    })

    it('should not invoke the error page getInitialProps client-side for server-side errors', async () => {
      const [b] = await setupErrorHydrationTests(next, '/with-error')

      expect(
        await b.eval(
          () =>
            (window as any).__ERROR_PAGE_GET_INITIAL_PROPS_INVOKED_CLIENT_SIDE__
        )
      ).toBe(undefined)
    })

    it('should log an message for client-side errors, including the full, custom error', async () => {
      const [browser, consoleMessages] = await setupErrorHydrationTests(
        next,
        '/no-error'
      )

      const link = await browser.elementByCss('a')
      await link.click()

      expect(
        consoleMessages.some((m) => m.includes('Error: custom error'))
      ).toBe(true)

      expect(
        consoleMessages.some((m) =>
          m.includes(
            'A client-side exception has occurred, see here for more info'
          )
        )
      ).toBe(true)
    })

    it("invokes _error's getInitialProps for client-side errors", async () => {
      const [browser] = await setupErrorHydrationTests(next, '/no-error')

      const link = await browser.elementByCss('a')
      await link.click()

      expect(
        await browser.eval(
          () =>
            (window as any).__ERROR_PAGE_GET_INITIAL_PROPS_INVOKED_CLIENT_SIDE__
        )
      ).toBe(true)
    })
  }
)
