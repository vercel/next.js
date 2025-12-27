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
      // Split on "Ready in" to get the logs after server startup
      const readyIndex = next.cliOutput.indexOf('Ready in')
      const serverLog =
        readyIndex !== -1 ? next.cliOutput.slice(readyIndex) : next.cliOutput
      const cliOutputLines = serverLog.split('\n')

      const ORDERED_LOGS = [
        'instrumentation:side-effect',
        'instrumentation:register:begin',
        'instrumentation:register:timeout',
        'instrumentation:register:end',
        'global-side-effect:app-router-page',
      ]
      const searchedLines = cliOutputLines.filter((line) =>
        ORDERED_LOGS.includes(line.trim())
      )

      expect(searchedLines).toEqual(ORDERED_LOGS)
    })
  })
})
