import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instrumentation-order', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should work', async () => {
    await next.fetch('/')

    await retry(async () => {
      // Filter CLI output for the instrumentation-related logs
      // We look for these logs starting from when instrumentation begins
      const cliOutputLines = next.cliOutput.split('\n')

      const ORDERED_LOGS = [
        'instrumentation:side-effect',
        'instrumentation:register:begin',
        'instrumentation:register:timeout',
        'instrumentation:register:end',
        'global-side-effect:app-router-page',
      ]

      // Find all matching lines
      const allMatchingLines = cliOutputLines
        .map((line) => line.trim())
        .filter((line) => ORDERED_LOGS.includes(line))

      // Find where instrumentation starts and extract the sequence from there
      const instrumentationStartIndex = allMatchingLines.indexOf(
        'instrumentation:side-effect'
      )
      expect(instrumentationStartIndex).toBeGreaterThanOrEqual(0)

      const searchedLines = allMatchingLines.slice(
        instrumentationStartIndex,
        instrumentationStartIndex + ORDERED_LOGS.length
      )

      expect(searchedLines).toEqual(ORDERED_LOGS)
    })
  })
})
