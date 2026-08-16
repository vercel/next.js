import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('canonical-interception-routes', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('requires a canonical hard-navigation route for every interception route', async () => {
    let output: string
    if (isNextDev) {
      await next.start()
      const response = await (await next.fetch('/')).text()
      output = `${next.cliOutput}\n${response}`
    } else {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      output = next.cliOutput
    }

    output = stripAnsi(output)
    expect(output).toContain(
      'interception routes do not have a canonical route'
    )
    expect(output).toContain('/(.)missing/[id] (expected /missing/[id])')
    expect(output).toContain('loaded directly or refreshed')
  })
})
