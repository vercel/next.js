/* eslint-env jest */
import { isNextDev, nextTestSetup } from 'e2e-utils'
import * as Log from './utils/log'

// This test relies on next.build() so it can't work in dev mode.
const _describe = isNextDev ? describe.skip : describe

_describe('unstable_after() in generateStaticParams', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true, // reading CLI logs to observe after
    skipStart: true,
  })

  if (skipped) return

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  const getLogs = () => {
    if (next.cliOutput.length < currentCliOutputIndex) {
      // cliOutput shrank since we started the test, so something (like a `sandbox`) reset the logs
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  it('runs unstable_after callbacks for each page during build', async () => {
    const buildResult = await next.build()
    expect(buildResult?.exitCode).toBe(0)

    {
      // after should run at build time
      const logsFromAfter = Log.readCliLogs(getLogs())
      expect(logsFromAfter).toContainEqual({
        source: '[generateStaticParams] /one/[myParam]',
      })
      expect(logsFromAfter).toContainEqual({
        source: '[generateStaticParams] /two/[myParam]',
      })
    }
  })
})
