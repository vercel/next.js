import { nextTestSetup } from 'e2e-utils'
import { gate, retry, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('unhandled-rejection-logging', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    captureRuntimeLogs: true,
  })

  it('logs an unhandled rejection', async () => {
    const outputIndex = next.cliOutput.length
    await next.fetch('/')

    // Runtime log delivery can lag behind the response.
    await retry(() => {
      expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(
        '⨯ unhandledRejection: Error: test unhandled rejection'
      )
    }, 30_000)

    if (await gate((c) => c.deploy)) {
      // Vercel also reports the rejection from its function wrapper. These are
      // distinct records, not a replay to deduplicate. Assert both sources;
      // asynchronous deployment logs do not provide a complete count window.
      await retry(() => {
        expect(stripAnsi(next.cliOutput.slice(outputIndex))).toContain(
          'Unhandled Rejection: Error: test unhandled rejection'
        )
      }, 30_000)
    } else {
      // Give the local process's remaining listeners a chance to log before
      // checking that only the single Next.js listener reported the rejection.
      await waitFor(1000)
      const cliOutput = stripAnsi(next.cliOutput.slice(outputIndex))
      expect(
        cliOutput.split('Error: test unhandled rejection').length - 1
      ).toBe(1)
    }
  })
})
