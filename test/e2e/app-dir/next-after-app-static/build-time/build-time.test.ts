/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import * as Log from './utils/log'
import { setTimeout } from 'timers/promises'

// This suite relies on next.build() and local CLI logs.
// @force-gate !dev
// @force-gate !deploy
describe('after() in static pages', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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

  const resetLogs = () => {
    currentCliOutputIndex = next.cliOutput.length
  }

  it('runs after during build', async () => {
    const buildResult = await next.build()
    expect(buildResult?.exitCode).toBe(0)

    {
      // after should run at build time
      const logsFromAfter = Log.readCliLogs(getLogs())
      expect(logsFromAfter).toContainEqual({
        source: '[page] /static/dynamic-error',
      })
      expect(logsFromAfter).toContainEqual({
        source: '[page] /static/dynamic-force-static',
      })
      expect(logsFromAfter).toContainEqual({
        source: '[route] /static/route',
      })
    }

    resetLogs()
    await next.start({ skipBuild: true })

    {
      const res = await next.fetch('/static/dynamic-error')
      expect(res.status).toBe(200)
    }

    {
      const res = await next.fetch('/static/dynamic-force-static')
      expect(res.status).toBe(200)
    }

    {
      const res = await next.fetch('/static/route')
      expect(res.status).toBe(200)
    }

    await setTimeout(1000) // no other good way to make sure any possible afters ran

    {
      // all the pages/routes have been statically prerendered, so
      // we should not observe any after()s at runtime
      const logsFromAfter = Log.readCliLogs(getLogs())
      expect(logsFromAfter).toHaveLength(0)
    }
  })
})
