import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('app-dir action handling - next export', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      nanoid: '4.0.1',
      'server-only': 'latest',
    },
  })

  if (!isNextStart) {
    it('skip test for development mode', () => {})
    return
  }

  beforeAll(async () => {
    await next.stop()
    await next.patchFile(
      'next.config.js',
      `
      module.exports = {
        output: 'export'
      }
      `
    )
    // interception routes are also not supported with export
    await next.remove('app/interception-routes')
    try {
      await next.start()
    } catch {}
  })

  it('should error when use export output for server actions', async () => {
    expect(next.cliOutput).toContain(
      `Server Actions are not supported with static export.`
    )
  })
})
