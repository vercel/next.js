import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('error-hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not log server-side errors', async () => {
    const browser = await next.browser('/with-error')
    const messages = await browser.log()

    expect(messages).not.toEqual(
      expect.arrayContaining([
        {
          message: expect.stringContaining('Error: custom error'),
          source: 'error',
        },
      ])
    )
  })

  it('should not invoke the error page getInitialProps client-side for server-side errors', async () => {
    const browser = await next.browser('/with-error')

    expect(
      await browser.eval(
        () =>
          (window as any).__ERROR_PAGE_GET_INITIAL_PROPS_INVOKED_CLIENT_SIDE__
      )
    ).toBe(undefined)
  })

  it('should log a message for client-side errors, including the full, custom error', async () => {
    const browser = await next.browser('/no-error')
    await browser.elementByCss('a').click()
    const messages = await browser.log()

    retry(() => {
      expect(messages).toEqual(
        expect.arrayContaining([
          {
            message: expect.stringContaining('Error: custom error'),
            source: 'error',
          },
          {
            message: expect.stringContaining(
              'A client-side exception has occurred, see here for more info'
            ),
            source: 'error',
          },
        ])
      )
    })
  })

  it("invokes _error's getInitialProps for client-side errors", async () => {
    const browser = await next.browser('/no-error')
    await browser.elementByCss('a').click()

    retry(async () => {
      expect(
        await browser.eval(
          () =>
            (window as any).__ERROR_PAGE_GET_INITIAL_PROPS_INVOKED_CLIENT_SIDE__
        )
      ).toBe(true)
    })
  })
})
