import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

const ORDERED_LOGS = [
  'instrumentation:side-effect',
  'instrumentation:register:begin',
  'instrumentation:register:timeout',
  'instrumentation:register:end',
  'global-side-effect:app-router-page',
]

describe('instrumentation-order', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should work using cheerio', async () => {
    // Wait for the timeout in the instrumentation to complete
    await waitFor(500)

    // Dev mode requires to render the page to trigger the build of the page
    if (isNextDev) {
      await next.render$('/')
    }

    const serverLog = next.cliOutput.split('Starting...')[1]
    const cliOutputLines = serverLog.split('\n')
    const searchedLines = cliOutputLines.filter((line) =>
      ORDERED_LOGS.includes(line.trim())
    )

    expect(searchedLines).toEqual(ORDERED_LOGS)
  })
})
