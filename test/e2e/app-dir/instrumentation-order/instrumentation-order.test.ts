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
      const serverLog = next.cliOutput.split('Starting...')[1]
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
