import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// This suite asserts server log output produced by requests or cache operations.
// Deploy-mode cliOutput contains build logs, not the live runtime logs under test.
// @force-gate !deploy
describe('unhandled-rejection-logging', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('logs an unhandled rejection', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/')

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain('unhandledRejection')
    })

    // Give the remaining listeners a chance to log before asserting.
    await waitFor(1000)

    const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))

    // The rejection must be logged exactly once, by the single registered
    // listener, and not additionally by other process listeners.
    expect(cliOutput).toContain(
      '⨯ unhandledRejection: Error: test unhandled rejection'
    )

    expect(cliOutput.split('Error: test unhandled rejection').length - 1).toBe(
      1
    )
  })
})
