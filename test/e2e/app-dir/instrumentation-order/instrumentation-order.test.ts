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
      // `next.cliOutput` includes both `next build` and `next start` in the production test run
      // Because of that we have to split the output by `Ready in` and get the second part only
      const serverLog = next.cliOutput.split('Ready in')[1]
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
