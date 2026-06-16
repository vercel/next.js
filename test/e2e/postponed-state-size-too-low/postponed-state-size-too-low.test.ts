import { nextTestSetup } from 'e2e-utils'

describe('app-dir - postponed state size too low for prerendered shell', () => {
  const { isNextDeploy, isNextDev, next } = nextTestSetup({
    files: __dirname,
  })

  it('surfaces a digest-tagged parse failure on resume', async () => {
    const { browser, response } = await next.browserWithResponse('/')

    // The static prelude was already a 200; we can't change that now.
    expect({ status: response.status() }).toEqual({ status: 200 })

    // The static parts of the prelude are still in the DOM.
    expect(await browser.elementByCss('[data-testid="name"]').text()).toBe(
      'Product'
    )

    // The failure is logged server-side, but only with content-free
    // diagnostics: never the raw parse error or the serialized state.
    const parseFailureLog = 'Failed to parse postponed state'
    // The surfaced error is reported to the `onRequestError` instrumentation
    // hook (see `instrumentation.ts`) with the stable digest.
    const onRequestErrorLog =
      '[instrumentation] onRequestError, digest: NEXT_POSTPONED_STATE_PARSE_FAILED, message: "Failed to parse postponed state"'

    if (isNextDev) {
      // We don't transport the postponed state in dev, so the failure path
      // doesn't trigger and the dynamic part renders normally.
      expect(await browser.elementByCss('[data-testid="dynamic"]').text()).toBe(
        'dynamic part rendered at request time'
      )
      expect(next.cliOutput).not.toContain(parseFailureLog)
      expect(next.cliOutput).not.toContain(onRequestErrorLog)
    } else {
      // We do not resume the dynamic part: its content never renders. The
      // Suspense boundary stays on its fallback instead.
      expect(
        await browser.hasElementByCssSelector('[data-testid="dynamic"]')
      ).toBe(false)
      expect(
        await browser.elementByCss('[data-testid="fallback"]').text()
      ).toBe('loading…')

      if (!isNextDeploy) {
        // We don't have access to Vercel runtime logs.

        // Server-side, the failure is logged with content-free diagnostics.
        expect(next.cliOutput).toContain(parseFailureLog)
        expect(next.cliOutput).toContain("errorName: 'Error'")

        // The raw parse error and the serialized state are never logged.
        expect(next.cliOutput).not.toContain(
          'Decompressed resume data cache exceeded'
        )
        expect(next.cliOutput).not.toContain('x'.repeat(100))

        // Server-side, the surfaced error reaches `onRequestError` with a digest.
        expect(next.cliOutput).toContain(onRequestErrorLog)
      }

      // Client-side, the error surfaces through the root error boundary with
      // the same digest.
      const logs = await browser.log()
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: 'log',
            // An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.
            message:
              'report rejection, digest: NEXT_POSTPONED_STATE_PARSE_FAILED, message: "Minified React error #441; visit https://react.dev/errors/441 for the full message or use the non-minified dev environment for full errors and additional helpful warnings."',
          }),
        ])
      )
    }
  })
})
