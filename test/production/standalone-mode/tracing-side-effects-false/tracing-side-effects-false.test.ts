import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing-side-effects-false', () => {
  const dependencies = require('./package.json').dependencies

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should trace sideeffect imports even when sideEffects is false', async () => {
    let { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    expect(trace.files).toContainEqual(
      expect.stringMatching(/node_modules\/foo\/index\.js$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/node_modules\/foo\/package\.json$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/node_modules\/foo\/side-effect\.js$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/node_modules\/foo\/value\.js$/)
    )
  })
})
