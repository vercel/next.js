import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('unhandled-rejection-logging', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('logs an unhandled rejection', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/')

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain('unhandledRejection')
    })

    // Give the remaining listeners a chance to log before asserting.
    await waitFor(1000)

    const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

    // The same rejection is currently logged by multiple process listeners,
    // each with a different format.

    // The render runtime's crash-prevention listener logs the bare error.
    expect(cliOutput).toContain('\nError: test unhandled rejection')

    // The router server's listener logs with a label (note the two spaces).
    expect(cliOutput).toContain(
      '⨯ unhandledRejection:  Error: test unhandled rejection'
    )

    if (isNextDev) {
      // The dev server's listener logs with a label (single space).
      expect(cliOutput).toContain(
        '⨯ unhandledRejection: Error: test unhandled rejection'
      )
    }

    // In total, the single rejection is logged once per listener.
    expect(cliOutput.split('Error: test unhandled rejection').length - 1).toBe(
      isNextDev ? 3 : 2
    )
  })
})
