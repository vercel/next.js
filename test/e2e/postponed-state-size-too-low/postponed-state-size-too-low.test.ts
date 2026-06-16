import { nextTestSetup } from 'e2e-utils'

describe('app-dir - postponed state size too low for prerendered shell', () => {
  const { isNextDeploy, isNextDev, next } = nextTestSetup({
    files: __dirname,
  })

  it('serves the static shell and surfaces the decompression-limit error on resume', async () => {
    const { browser, response } = await next.browserWithResponse('/')

    expect({ status: response.status() }).toEqual({ status: 200 })
    expect(await browser.elementByCss('[data-testid="dynamic"]').text()).toBe(
      'dynamic part rendered at request time'
    )

    const errorMessage =
      'Failed to parse postponed state Error: Decompressed resume data cache exceeded 250 byte limit'
    if (isNextDev) {
      // We don't transport the postponed state in dev.
      // Ideally dev would also surface the error.
      expect(next.cliOutput).not.toContain(errorMessage)
    } else {
      if (!isNextDeploy) {
        // We don't have access to Vercel runtime logs.
        expect(next.cliOutput).toContain(errorMessage)
      }
      const logs = await browser.log()
      expect(logs).toEqual(
        expect.arrayContaining([
          {
            source: 'log',
            // The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.
            message:
              'report error, digest: undefined, message: "Minified React error #419; visit https://react.dev/errors/419 for the full message or use the non-minified dev environment for full errors and additional helpful warnings."',
          },
        ])
      )
    }
  })
})
