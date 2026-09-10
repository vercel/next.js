import { nextTestSetup } from 'e2e-utils'

// `prefetch = 'allow-runtime'` was a valid route segment config until it was
// removed in favor of Partial Prefetching. A build that still exports it must
// fail promptly with the invalid segment configuration error under every
// bundler, rather than stalling in the production compile phase.
//
// Gated to `start` because the assertion is on the local `next build` failing:
// in dev the config is only validated when the route is requested, and deploy
// mode has no local build output or CLI output to assert against.
// @force-gate start
describe('invalid-prefetch-segment-config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('fails the build for a removed prefetch segment config', async () => {
    await expect(next.start()).rejects.toThrow()

    expect(next.cliOutput).toContain(
      'Invalid segment configuration options detected for "/"'
    )
    expect(next.cliOutput).toContain(
      'Invalid prefetch value "allow-runtime" on "/", must be "auto", "partial", or "force-disabled".'
    )
  })
})
